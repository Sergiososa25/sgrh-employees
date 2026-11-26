require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: process.env.DB_NAME });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/departments', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT dept_no, dept_name FROM departments ORDER BY dept_no'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/departments/:dept_no/employees', async (req, res) => {
  try {
    const deptNo = req.params.dept_no.trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const onlyActive = req.query.active !== 'false';

    const [deptRows] = await pool.query(
      'SELECT dept_no, dept_name FROM departments WHERE dept_no = ?',
      [deptNo]
    );

    if (deptRows.length === 0) {
      return res.status(404).json({ error: 'Departamento no encontrado' });
    }

    const activeFilter = onlyActive ? " AND de.to_date = '9999-01-01'" : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT e.emp_no) AS total
       FROM dept_emp de
       INNER JOIN employees e ON de.emp_no = e.emp_no
       WHERE de.dept_no = ? ${activeFilter}`,
      [deptNo]
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT
         e.emp_no,
         e.first_name,
         e.last_name,
         e.hire_date,
         de.from_date,
         de.to_date
       FROM dept_emp de
       INNER JOIN employees e ON de.emp_no = e.emp_no
       WHERE de.dept_no = ? ${activeFilter}
       ORDER BY e.emp_no ASC
       LIMIT ? OFFSET ?`,
      [deptNo, limit, offset]
    );

    res.json({
      department: deptRows[0],
      active_only: onlyActive,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/employees', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const { dept_no, department, search } = req.query;

    let baseFromWhere = `
      FROM employees e
      LEFT JOIN dept_emp de
        ON e.emp_no = de.emp_no AND de.to_date = '9999-01-01'
      LEFT JOIN departments d
        ON de.dept_no = d.dept_no
      WHERE 1 = 1
    `;

    const params = [];

    if (dept_no) {
      baseFromWhere += ' AND d.dept_no = ?';
      params.push(dept_no.trim());
    }

    if (department) {
      baseFromWhere += ' AND d.dept_name LIKE ?';
      params.push(`%${department.trim()}%`);
    }

    if (search) {
      baseFromWhere += " AND CONCAT(e.first_name, ' ', e.last_name) LIKE ?";
      params.push(`%${search.trim()}%`);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT e.emp_no) AS total ${baseFromWhere}`,
      params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `SELECT DISTINCT
         e.emp_no,
         e.first_name,
         e.last_name,
         e.hire_date,
         d.dept_no,
         d.dept_name
       ${baseFromWhere}
       ORDER BY e.emp_no ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/employees/:emp_no/full', async (req, res) => {
  try {
    const empNo = Number(req.params.emp_no);

    if (!Number.isInteger(empNo) || empNo <= 0) {
      return res.status(400).json({ error: 'emp_no debe ser un número válido' });
    }

    const [rows] = await pool.query(
      `SELECT
         e.emp_no,
         e.first_name,
         e.last_name,
         e.gender,
         e.birth_date,
         e.hire_date,
         d.dept_no,
         d.dept_name AS current_department,
         s.salary AS current_salary
       FROM employees e
       LEFT JOIN dept_emp de
         ON e.emp_no = de.emp_no AND de.to_date = '9999-01-01'
       LEFT JOIN departments d
         ON de.dept_no = d.dept_no
       LEFT JOIN salaries s
         ON e.emp_no = s.emp_no AND s.to_date = '9999-01-01'
       WHERE e.emp_no = ?`,
      [empNo]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/employees/:emp_no/salaries', async (req, res) => {
  try {
    const empNo = Number(req.params.emp_no);

    if (!Number.isInteger(empNo) || empNo <= 0) {
      return res.status(400).json({ error: 'emp_no debe ser un número válido' });
    }

    const [empRows] = await pool.query(
      'SELECT emp_no, first_name, last_name FROM employees WHERE emp_no = ?',
      [empNo]
    );

    if (empRows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const [salaries] = await pool.query(
      `SELECT salary, from_date, to_date
       FROM salaries
       WHERE emp_no = ?
       ORDER BY from_date ASC`,
      [empNo]
    );

    res.json({
      employee: empRows[0],
      salaries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/employees/:id/historial', async (req, res) => {
  try {
    const empNo = Number(req.params.id);

    if (!Number.isInteger(empNo) || empNo <= 0) {
      return res.status(400).json({ error: 'id debe ser un número válido' });
    }

    const [empRows] = await pool.query(
      'SELECT emp_no, first_name, last_name, hire_date FROM employees WHERE emp_no = ?',
      [empNo]
    );

    if (empRows.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const [titles] = await pool.query(
      `SELECT title, from_date, to_date
       FROM titles
       WHERE emp_no = ?
       ORDER BY from_date ASC`,
      [empNo]
    );

    const [salaries] = await pool.query(
      `SELECT salary, from_date, to_date
       FROM salaries
       WHERE emp_no = ?
       ORDER BY from_date ASC`,
      [empNo]
    );

    res.json({
      employee: empRows[0],
      titles,
      salaries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/resumen', async (req, res) => {
  try {
    const [[totalEmpRow]] = await pool.query(
      'SELECT COUNT(*) AS total_empleados FROM employees'
    );

    const [porDepartamento] = await pool.query(
      `SELECT
         d.dept_no,
         d.dept_name,
         COUNT(de.emp_no) AS total_empleados
       FROM departments d
       LEFT JOIN dept_emp de
         ON d.dept_no = de.dept_no AND de.to_date = '9999-01-01'
       GROUP BY d.dept_no, d.dept_name
       ORDER BY d.dept_no ASC`
    );

    const [incidenciasRecientes] = await pool.query(
      `SELECT
         i.id_incidencia,
         i.emp_no,
         e.first_name,
         e.last_name,
         i.tipo,
         i.fecha,
         i.descripcion,
         i.estatus
       FROM incidencias_rrhh i
       INNER JOIN employees e ON i.emp_no = e.emp_no
       ORDER BY i.fecha DESC, i.id_incidencia DESC
       LIMIT 10`
    );

    res.json({
      total_empleados: totalEmpRow.total_empleados,
      empleados_por_departamento: porDepartamento,
      incidencias_recientes: incidenciasRecientes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/incidencias', async (req, res) => {
  try {
    const { emp_no, estatus } = req.query;

    let sql = `
      SELECT
        i.id_incidencia,
        i.emp_no,
        e.first_name,
        e.last_name,
        i.tipo,
        i.fecha,
        i.descripcion,
        i.estatus,
        i.created_at
      FROM incidencias_rrhh i
      INNER JOIN employees e ON i.emp_no = e.emp_no
      WHERE 1 = 1
    `;
    const params = [];

    if (emp_no) {
      sql += ' AND i.emp_no = ?';
      params.push(Number(emp_no));
    }

    if (estatus) {
      sql += ' AND i.estatus = ?';
      params.push(estatus.trim());
    }

    sql += ' ORDER BY i.fecha DESC, i.id_incidencia DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/incidencias', async (req, res) => {
  try {
    const { emp_no, tipo, fecha, descripcion, estatus } = req.body;

    if (!emp_no || !tipo || !fecha || !descripcion) {
      return res.status(400).json({
        error: 'Los campos emp_no, tipo, fecha y descripcion son obligatorios'
      });
    }

    const [empRows] = await pool.query(
      'SELECT emp_no FROM employees WHERE emp_no = ?',
      [Number(emp_no)]
    );

    if (empRows.length === 0) {
      return res.status(404).json({ error: 'El empleado indicado no existe' });
    }

    const [result] = await pool.query(
      `INSERT INTO incidencias_rrhh (emp_no, tipo, fecha, descripcion, estatus)
       VALUES (?, ?, ?, ?, ?)`,
      [
        Number(emp_no),
        String(tipo).trim(),
        fecha,
        String(descripcion).trim(),
        estatus ? String(estatus).trim() : 'Abierta'
      ]
    );

    const [created] = await pool.query(
      'SELECT * FROM incidencias_rrhh WHERE id_incidencia = ?',
      [result.insertId]
    );

    res.status(201).json(created[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/incidencias/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const [existing] = await pool.query(
      'SELECT * FROM incidencias_rrhh WHERE id_incidencia = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    const current = existing[0];
    const tipo = req.body.tipo !== undefined ? String(req.body.tipo).trim() : current.tipo;
    const fecha = req.body.fecha !== undefined ? req.body.fecha : current.fecha;
    const descripcion =
      req.body.descripcion !== undefined
        ? String(req.body.descripcion).trim()
        : current.descripcion;
    const estatus =
      req.body.estatus !== undefined ? String(req.body.estatus).trim() : current.estatus;

    await pool.query(
      `UPDATE incidencias_rrhh
       SET tipo = ?, fecha = ?, descripcion = ?, estatus = ?
       WHERE id_incidencia = ?`,
      [tipo, fecha, descripcion, estatus, id]
    );

    const [updated] = await pool.query(
      'SELECT * FROM incidencias_rrhh WHERE id_incidencia = ?',
      [id]
    );

    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/incidencias/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const [result] = await pool.query(
      'DELETE FROM incidencias_rrhh WHERE id_incidencia = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Incidencia no encontrada' });
    }

    res.json({ deleted: true, id_incidencia: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});