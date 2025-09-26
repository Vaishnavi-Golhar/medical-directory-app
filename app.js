const express = require("express");
const mysql = require("mysql2/promise");
const { Client } = require("@opensearch-project/opensearch");

const app = express();
app.use(express.json());

// MySQL (RDS) connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// OpenSearch client
// Use ECS environment variable OS_ENDPOINT, fallback to your URL
const osClient = new Client({
  node:
    process.env.OS_ENDPOINT ||
    "https://search-doctor-patient-penvxbipjkn67zune473j5uowq.ap-south-1.es.amazonaws.com",
});

// Create doctor
app.post("/doctor", async (req, res) => {
  const { name, specialty, location } = req.body;
  try {
    // Save to RDS
    const [result] = await db.query(
      "INSERT INTO doctors (name, specialty, location) VALUES (?, ?, ?)",
      [name, specialty, location]
    );

    const doctor = { id: result.insertId, name, specialty, location };

    // Index to OpenSearch
    await osClient.index({
      index: "doctors",
      id: doctor.id.toString(),
      body: doctor,
    });

    res.status(201).json({ message: "Doctor created", doctor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creating doctor" });
  }
});

// Get doctor by ID (from RDS)
app.get("/doctor/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query("SELECT * FROM doctors WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching doctor" });
  }
});

// Search doctors by specialty (from OpenSearch)
app.get("/search/doctors", async (req, res) => {
  const { specialty } = req.query;
  try {
    const result = await osClient.search({
      index: "doctors",
      body: {
        query: {
          match: { specialty: specialty },
        },
      },
    });

    const hits = result.hits.hits.map((hit) => hit._source);
    res.json(hits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error searching doctors" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));
