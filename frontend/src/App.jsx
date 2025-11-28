import React, { useState } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const uploadFile = async () => {
    if (!file) {
      alert("Please select a file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("autoProcess", "true");

    try {
      setLoading(true);
      setStatus("Uploading file…");

      const res = await axios.post(
        "http://localhost:5000/api/upload-doc",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" }
        }
      );

      setStatus("File uploaded! Starting processing…");

      // For now, backend only uploads.
      // Later we will trigger extraction using docId.
      setTimeout(() => {
        setStatus(`Processing complete! Doc ID: ${res.data.docId}`);
        setLoading(false);
      }, 1000);

    } catch (err) {
      setStatus("Error uploading file");
      setLoading(false);
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>API Documentation Uploader</h1>

      <input type="file" onChange={handleFileChange} style={styles.fileInput} />

      <button onClick={uploadFile} style={styles.button}>
        Upload & Process
      </button>

      {loading ? (
        <p style={styles.status}>⏳ {status}</p>
      ) : (
        <p style={styles.status}>{status}</p>
      )}
    </div>
  );
}

const styles = {
  container: {
    marginTop: "100px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "Arial"
  },
  header: {
    marginBottom: "20px"
  },
  fileInput: {
    marginBottom: "20px"
  },
  button: {
    padding: "10px 20px",
    backgroundColor: "#4CAF50",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer"
  },
  status: {
    marginTop: "20px",
    fontSize: "18px"
  }
};

export default App;
