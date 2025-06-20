require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise'); // Importar la versión de Promesas de mysql2
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Crear una conexión con el pool de conexiones de mysql2 con Promesas
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

app.post('/login', async (req, res) => {
  const { usuario, contrasena } = req.body;

  const query = `
    SELECT u.id_usuario, u.usuario, u.contrasena, p.tipo
    FROM Usuario u
    JOIN Persona p ON u.id_persona = p.id_persona
    WHERE u.usuario = ? AND u.activo = 1
  `;

  try {
    const [results] = await db.query(query, [usuario]);
    if (results.length === 0) return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });

    const user = results[0];
    if (user.contrasena !== contrasena) return res.status(401).json({ error: 'Contraseña incorrecta' });

    res.json({ id: user.id_usuario, usuario: user.usuario, tipo: user.tipo });
  } catch (err) {
    console.error('Error en el servidor:', err);
    return res.status(500).json({ error: 'Error en el servidor', details: err.message });
  }
});

app.get('/vehiculos', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT * FROM vehiculos
    `);

    if (results.length === 0) {
      return res.status(404).json({ message: 'No hay vehículos disponibles' });
    }

    res.json(results);
  } catch (err) {
    console.error('Error al obtener vehículos:', err);
    return res.status(500).json({ error: 'Error al obtener vehículos', details: err.message || err });
  }
});
app.post('/vehiculos', async (req, res) => {
  const {
    id_usuario,
    id_propio,
    tipo,
    marca,
    modelo,
    anio,
    ubicacion,
    color,
    transmision,
    numero_serie,
    numero_motor,
    placas,
    cuenta_seguro,
    aseguradora,
    fecha_inicio_seguro,
    fecha_vencimiento_seguro
  } = req.body;

  try {
    const query = `
      INSERT INTO Vehiculos (
        id_usuario, id_propio, tipo, marca, modelo, anio, ubicacion,
        color, transmision, numero_serie, numero_motor, placas,
        cuenta_seguro, aseguradora, fecha_inicio_seguro, fecha_vencimiento_seguro
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(query, [
      id_usuario || null,
      id_propio,
      tipo,
      marca,
      modelo,
      anio,
      ubicacion,
      color,
      transmision,
      numero_serie,
      numero_motor,
      placas,
      cuenta_seguro,
      aseguradora,
      fecha_inicio_seguro,
      fecha_vencimiento_seguro
    ]);

    res.status(201).json({ message: 'Vehículo insertado correctamente', id: result.insertId });
  } catch (err) {
    console.error('Error al insertar vehículo:', err);
    res.status(500).json({ error: 'Error al insertar vehículo', details: err.message });
  }
});
app.get('/usuarios', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT u.id_usuario, per.nombre
      FROM Usuario u
      JOIN Persona per ON u.id_persona = per.id_persona
    `);

    res.json(results);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error al obtener usuarios', details: err.message });
  }
});
app.delete('/vehiculos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Actualizamos el status a 0 (inactivo)
    const [result] = await db.query(
      'UPDATE Vehiculos SET status = 0 WHERE id_vehiculo = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Vehículo no encontrado' });
    }

    res.json({ message: 'Vehículo marcado como inactivo correctamente' });
  } catch (err) {
    console.error('Error al desactivar vehículo:', err);
    res.status(500).json({ error: 'Error al desactivar vehículo', details: err.message });
  }
});

// Obtener LPs totales y remisiones totales
app.get('/graficas/ruta', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        SUM(lps_totales) AS lps_totales, 
        SUM(remisiones_totales) AS remisiones_totales
      FROM Ruta
    `);
    res.json(result[0]); // Devuelve la suma de lps_totales y remisiones_totales
  } catch (err) {
    console.error('Error al obtener datos de Ruta:', err);
    res.status(500).json({ error: 'Error al obtener datos de Ruta' });
  }
});
// Obtener LPs exitosos y LPs fallidos de CierreRuta
app.get('/graficas/cierre-ruta', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        SUM(lps_exitosos) AS lps_exitosos, 
        SUM(lps_fallidos) AS lps_fallidos
      FROM CierreRuta
    `);
    res.json(result[0]); // Devuelve la suma de lps_exitosos y lps_fallidos
  } catch (err) {
    console.error('Error al obtener datos de CierreRuta:', err);
    res.status(500).json({ error: 'Error al obtener datos de CierreRuta' });
  }
});

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

app.get('/exportar-ruta', async (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: 'Fecha requerida en formato YYYY-MM-DD' });
  }

  try {
    const [rutas] = await db.query(
      'SELECT * FROM Ruta WHERE fecha_registro = ?',
      [fecha]
    );

    if (rutas.length === 0) {
      return res.status(404).json({ error: 'No hay datos para esa fecha' });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ruta');

    // Agregar encabezados
    worksheet.columns = [
      { header: 'ID Ruta', key: 'id_ruta', width: 10 },
      { header: 'Número Ruta', key: 'numero_ruta', width: 15 },
      { header: 'Tipo Ruta', key: 'tipo_ruta', width: 15 },
      { header: 'Categoría Ruta', key: 'categoria_ruta', width: 20 },
      { header: 'LPs Totales', key: 'lps_totales', width: 15 },
      { header: 'Remisiones Totales', key: 'remisiones_totales', width: 20 },
      { header: 'Fecha Registro', key: 'fecha_registro', width: 20 },
      { header: 'ID CR', key: 'id_cr', width: 10 },
      { header: 'ID Usuario', key: 'id_usuario', width: 15 },
    ];

    rutas.forEach(ruta => {
      worksheet.addRow(ruta);
    });

    const filePath = path.join(__dirname, `ruta_${fecha}.xlsx`);
    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, `ruta_${fecha}.xlsx`, err => {
      if (err) 
        console.error('Error al descargar archivo:', err);
        return res.status(500).json({ error: 'Error al descargar el archivo' });
      }

      // Eliminar archivo después de descargar
      fs.unlinkSync(filePath);
    });
  } catch (err) {
    console.error('Error exportando datos:', err);
    res.status(500).json({ error: 'Error exportando datos' });
  }
});
app.get('/ruta-por-fecha', async (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: 'Fecha requerida en formato YYYY-MM-DD' });
  }

  try {
    const [rutas] = await db.query(
      'SELECT * FROM Ruta WHERE fecha_registro = ?',
      [fecha]
    );

    res.json(rutas);
  } catch (err) {
    console.error('Error al obtener rutas:', err);
    res.status(500).json({ error: 'Error al obtener rutas' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
