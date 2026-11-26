# SGRH-Employees — Sistema de Gestión de Recursos Humanos Local

Aplicación web local full stack desarrollada con **Node.js**, **Express**, **MySQL 8** y **HTML/Bootstrap/JavaScript** sobre la base de datos pública `employees`, complementada con la tabla `incidencias_rrhh` y un widget de fecha y temperatura mediante **Open-Meteo**[cite: 1, 2, 6, 10].

## Arquitectura y estructura de carpetas

- **Backend (Node.js + Express):** Expone la API REST conectada mediante `mysql2/promise` a MySQL local y sirve los archivos estáticos del frontend desde `public/`[cite: 2, 4, 6].
- **Base de datos (MySQL 8):** Reutiliza las tablas de `employees` (`employees`, `departments`, `dept_emp`, `titles`, `salaries`) y agrega `incidencias_rrhh` vinculada a `employees.emp_no`[cite: 2, 6].
- **Frontend (HTML + Bootstrap 5 + JS):** Consume los endpoints del backend con `fetch()` para mostrar dashboard, catálogo de empleados, detalle e historial, departamentos, CRUD de incidencias y el widget de fecha y clima[cite: 1, 2, 4, 6].

```text
api-employees/
├── public/
│   └── index.html
├── sql/
│   └── incidencias_rrhh.sql
├── .env
├── package.json
├── package-lock.json
├── README.md
└── server.js