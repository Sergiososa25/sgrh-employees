USE employees;

CREATE TABLE IF NOT EXISTS incidencias_rrhh (
  id_incidencia INT AUTO_INCREMENT PRIMARY KEY,
  emp_no INT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL,
  estatus VARCHAR(30) NOT NULL DEFAULT 'Abierta',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_incidencias_employee
    FOREIGN KEY (emp_no) REFERENCES employees(emp_no)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);