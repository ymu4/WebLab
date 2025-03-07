const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
const port = 4000;

// Enable CORS for your React app
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "prod_dsal",
  port: 3306, // Keep MySQL port as 3306
});

app.get("/api/events", (req, res) => {
  const query = "SELECT * FROM events ORDER BY event_date DESC";

  db.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(results);
  });
});

// events
app.get("/api/events/:id", (req, res) => {
  const query = "SELECT * FROM events WHERE event_id = ?";

  db.query(query, [req.params.id], (error, results) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.json(results[0]);
  });
});

// members
app.get("/api/members", (req, res) => {
  const query = "SELECT * FROM members ORDER BY member_type, first_name";

  db.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(results);
  });
});

// Get all publications with filters
app.get("/api/publications", (req, res) => {
  let query = `
    SELECT 
      articles.*, 
      publishers.name as publisher_name,
      GROUP_CONCAT(DISTINCT authors.fullname ORDER BY authors.fullname ASC) as authors,
      GROUP_CONCAT(DISTINCT keywords.keyword ORDER BY keywords.keyword ASC) as keywords,
      GROUP_CONCAT(DISTINCT keywords.color ORDER BY keywords.keyword ASC) as keyword_colors
    FROM articles
    LEFT JOIN articleauthors ON articles.article_id = articleauthors.article_id
    LEFT JOIN authors ON articleauthors.author_id = authors.author_id
    LEFT JOIN articlekeywords ON articles.article_id = articlekeywords.article_id
    LEFT JOIN keywords ON articlekeywords.keyword_id = keywords.keyword_id
    LEFT JOIN publishers ON articles.publisher_id = publishers.publisher_id
  `;

  const whereConditions = [];
  const params = [];

  if (req.query.year) {
    whereConditions.push("articles.publication_year = ?");
    params.push(req.query.year);
  }

  if (req.query.type) {
    whereConditions.push("articles.type = ?");
    params.push(req.query.type);
  }

  if (req.query.keyword) {
    whereConditions.push("keywords.keyword = ?");
    params.push(req.query.keyword);
  }

  if (whereConditions.length > 0) {
    query += " WHERE " + whereConditions.join(" AND ");
  }

  query += ` GROUP BY articles.article_id
    ORDER BY articles.publication_year DESC, articles.title ASC`;

  db.query(query, params, (error, results) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(results);
  });
});

// Get filter options
app.get("/api/publications/filters", (req, res) => {
  const queries = {
    types: "SELECT DISTINCT type FROM articles",
    keywords: "SELECT DISTINCT keyword, color FROM keywords",
    journals:
      "SELECT DISTINCT journal_title FROM articles WHERE type = 'Journal Article'",
    conferences:
      "SELECT DISTINCT journal_title FROM articles WHERE type = 'Conference Paper'",
    years:
      "SELECT DISTINCT publication_year FROM articles ORDER BY publication_year DESC",
  };

  Promise.all(
    Object.entries(queries).map(
      ([key, query]) =>
        new Promise((resolve, reject) => {
          db.query(query, (error, results) => {
            if (error) reject(error);
            resolve({ [key]: results });
          });
        })
    )
  )
    .then((results) => {
      const filters = Object.assign({}, ...results);
      res.json(filters);
    })
    .catch((error) => {
      res.status(500).json({ error: error.message });
    });
});

// Get publication by DOI
app.get("/api/publications/:doi", (req, res) => {
  // Decode the DOI parameter
  const decodedDoi = decodeURIComponent(req.params.doi);
  console.log("Received request for DOI:", decodedDoi);

  const query = `
    SELECT 
      articles.*, 
      publishers.name as publisher_name,
      GROUP_CONCAT(DISTINCT authors.fullname ORDER BY authors.fullname ASC) as authors,
      GROUP_CONCAT(DISTINCT keywords.keyword ORDER BY keywords.keyword ASC) as keywords,
      GROUP_CONCAT(DISTINCT keywords.color ORDER BY keywords.keyword ASC) as keyword_colors 
    FROM articles 
    LEFT JOIN articleauthors ON articles.article_id = articleauthors.article_id 
    LEFT JOIN authors ON articleauthors.author_id = authors.author_id 
    LEFT JOIN articlekeywords ON articles.article_id = articlekeywords.article_id 
    LEFT JOIN keywords ON articlekeywords.keyword_id = keywords.keyword_id 
    LEFT JOIN publishers ON articles.publisher_id = publishers.publisher_id 
    WHERE articles.doi = ?
    GROUP BY articles.article_id;
  `;

  const authorQuery = `
    SELECT authors.* 
    FROM articles, articleauthors, authors 
    WHERE articles.article_id = articleauthors.article_id 
    AND articleauthors.author_id = authors.author_id 
    AND articles.doi = ?;
  `;

  // Add logging to debug the query
  console.log("Executing query with DOI:", decodedDoi);

  db.query(query, [decodedDoi], (error, articles) => {
    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: error.message });
    }

    if (articles.length === 0) {
      console.log("No publication found for DOI:", decodedDoi);
      return res.status(404).json({ error: "Publication not found" });
    }

    db.query(authorQuery, [decodedDoi], (authorError, authors) => {
      if (authorError) {
        console.error("Author query error:", authorError);
        return res.status(500).json({ error: authorError.message });
      }

      const publication = articles[0];
      publication.authorDetails = authors;
      console.log("Sending publication data:", publication);
      res.json(publication);
    });
  });
});

// In server.js - Add this new endpoint

// Get publication by DOI with member status for authors
app.get("/api/publications/:doi", (req, res) => {
  const decodedDoi = decodeURIComponent(req.params.doi);
  
  const query = `
    SELECT 
      articles.*, 
      publishers.name as publisher_name,
      GROUP_CONCAT(DISTINCT authors.fullname ORDER BY authors.fullname ASC) as authors,
      GROUP_CONCAT(DISTINCT keywords.keyword ORDER BY keywords.keyword ASC) as keywords,
      GROUP_CONCAT(DISTINCT keywords.color ORDER BY keywords.keyword ASC) as keyword_colors 
    FROM articles 
    LEFT JOIN articleauthors ON articles.article_id = articleauthors.article_id 
    LEFT JOIN authors ON articleauthors.author_id = authors.author_id 
    LEFT JOIN articlekeywords ON articles.article_id = articlekeywords.article_id 
    LEFT JOIN keywords ON articlekeywords.keyword_id = keywords.keyword_id 
    LEFT JOIN publishers ON articles.publisher_id = publishers.publisher_id 
    WHERE articles.doi = ?
    GROUP BY articles.article_id;
  `;

  const authorQuery = `
    SELECT 
      authors.*,
      CASE 
        WHEN members.member_id IS NOT NULL THEN members.member_id
        ELSE NULL
      END as member_id
    FROM articles
    JOIN articleauthors ON articles.article_id = articleauthors.article_id 
    JOIN authors ON articleauthors.author_id = authors.author_id 
    LEFT JOIN members ON (
      CONCAT(members.first_name, ' ', members.last_name) = authors.fullname
      OR members.email = authors.email
    )
    WHERE articles.doi = ?;
  `;

  db.query(query, [decodedDoi], (error, articles) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    if (articles.length === 0) {
      return res.status(404).json({ error: "Publication not found" });
    }

    db.query(authorQuery, [decodedDoi], (authorError, authors) => {
      if (authorError) {
        return res.status(500).json({ error: authorError.message });
      }

      const publication = articles[0];
      publication.authorDetails = authors;
      res.json(publication);
    });
  });
});

// Get all awards
app.get("/api/awards", (req, res) => {
  const query = "SELECT * FROM awards ORDER BY year DESC";

  db.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(results);
  });
});

// Get project types for filtering
app.get("/api/project-types", (req, res) => {
  const query = "SELECT * FROM project_types";

  db.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(results);
  });
});


app.get("/api/projects", (req, res) => {
  const { type } = req.query;

  let query = `
    SELECT DISTINCT p.*, GROUP_CONCAT(pt.name) as type_names
    FROM projects p
    JOIN project_types_junction ptj ON p.id = ptj.project_id
    JOIN project_types pt ON ptj.type_id = pt.id
  `;

  const queryParams = [];

  if (type && type !== "All") {
    query += ` WHERE p.id IN (
      SELECT project_id 
      FROM project_types_junction ptj2
      JOIN project_types pt2 ON ptj2.type_id = pt2.id
      WHERE pt2.name = ?
    )`;
    queryParams.push(type);
  }

  query += ` GROUP BY p.id ORDER BY p.created_at DESC`;

  db.query(query, queryParams, (error, results) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(results);
  });
});
// single project endpoint
app.get("/api/projects/:id", async (req, res) => {
  const projectId = req.params.id;

  // Validate project ID
  if (!projectId || isNaN(parseInt(projectId))) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  // Updated project query to use the junction table
  const projectQuery = `
    SELECT 
      p.*,
      GROUP_CONCAT(pt.name) as type_names
    FROM projects p
    LEFT JOIN project_types_junction ptj ON p.id = ptj.project_id
    LEFT JOIN project_types pt ON ptj.type_id = pt.id
    WHERE p.id = ?
    GROUP BY p.id`;

  // Researchers query remains the same
  const researchersQuery = `
    SELECT 
      a.author_id,
      a.fullname as name,
      pa.role,
      CONCAT_WS(', ', a.department, a.university, a.country) as affiliation
    FROM project_authors pa
    JOIN authors a ON pa.author_id = a.author_id
    WHERE pa.project_id = ?`;

  try {
    // Execute both queries
    const [projectResults, researcherResults] = await Promise.all([
      new Promise((resolve, reject) => {
        db.query(projectQuery, [projectId], (error, results) => {
          if (error) {
            console.error('Project query error:', error);
            reject(error);
          } else {
            console.log('Project query results:', results);
            resolve(results);
          }
        });
      }),
      new Promise((resolve, reject) => {
        db.query(researchersQuery, [projectId], (error, results) => {
          if (error) {
            console.error('Researchers query error:', error);
            reject(error);
          } else {
            console.log('Researchers query results:', results);
            resolve(results);
          }
        });
      })
    ]);

    if (projectResults.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projectResults[0];
    
    // Parse the content JSON
    try {
      if (project.content) {
        // Verify JSON is valid
        project.content = JSON.parse(project.content);
      }
    } catch (error) {
      console.error("Invalid JSON in project content:", error);
      return res.status(500).json({ error: "Invalid project content format" });
    }

    // Add researchers to project
    project.researchers = researcherResults;
    
    // Split type_names into array if exists
    if (project.type_names) {
      project.types = project.type_names.split(',');
      delete project.type_names;
    } else {
      project.types = [];
    }

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/json');
    return res.json(project);

  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
