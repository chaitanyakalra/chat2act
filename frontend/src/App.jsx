import React, { useState } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [zohoOrgId, setZohoOrgId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const uploadFile = async () => {
    // Validation
    if (!file) {
      alert("Please select a file first");
      return;
    }

    if (!zohoOrgId || zohoOrgId.trim() === "") {
      alert("Please enter your Zoho Organization ID");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("zohoOrgId", zohoOrgId.trim());
    formData.append("organizationName", organizationName.trim() || "");
    formData.append("autoProcess", "true");

    try {
      setLoading(true);
      setStatus("Uploading file and processing...");
      setResult(null);

      const res = await axios.post(
        "http://localhost:5000/api/upload-doc",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" }
        }
      );

      if (res.data.status === "processed") {
        setStatus("✅ Processing complete!");
        setResult(res.data);
      } else if (res.data.status === "uploaded") {
        setStatus("✅ File uploaded! Processing in background...");
        setResult(res.data);
      } else if (res.data.status === "uploaded_processing_failed") {
        setStatus("⚠️ File uploaded but processing failed");
        setResult(res.data);
      }

      setLoading(false);

    } catch (err) {
      setStatus("❌ Error: " + (err.response?.data?.message || err.message));
      setLoading(false);
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>🚀 Chat2Act Onboarding Portal</h1>
      <p style={styles.subtitle}>Upload your API specification to get started</p>

      <div style={styles.form}>
        {/* Zoho Organization ID */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Zoho Organization ID <span style={styles.required}>*</span>
          </label>
          <input
            type="text"
            value={zohoOrgId}
            onChange={(e) => setZohoOrgId(e.target.value)}
            placeholder="e.g., 12345678"
            style={styles.input}
            disabled={loading}
          />
          <small style={styles.hint}>
            Get this from your Zoho settings or bot configuration
          </small>
        </div>

        {/* Organization Name */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Organization Name (Optional)</label>
          <input
            type="text"
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
            placeholder="e.g., Acme Corp"
            style={styles.input}
            disabled={loading}
          />
          <small style={styles.hint}>
            A friendly name for your organization
          </small>
        </div>

        {/* File Upload */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            API Specification <span style={styles.required}>*</span>
          </label>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".json,.yaml,.yml,.pdf"
            style={styles.fileInput}
            disabled={loading}
          />
          <small style={styles.hint}>
            Supported formats: JSON, YAML, PDF (OpenAPI/Swagger)
          </small>
        </div>

        {/* Upload Button */}
        <button
          onClick={uploadFile}
          style={{
            ...styles.button,
            ...(loading ? styles.buttonDisabled : {})
          }}
          disabled={loading}
        >
          {loading ? "⏳ Processing..." : "Upload & Process"}
        </button>
      </div>

      {/* Status Message */}
      {status && (
        <div style={styles.statusBox}>
          <p style={styles.status}>{status}</p>
        </div>
      )}

      {/* Result Details */}
      {result && result.status === "processed" && (
        <div style={styles.resultBox}>
          <h3 style={styles.resultHeader}>✅ Processing Complete!</h3>
          <div style={styles.resultGrid}>
            <div style={styles.resultItem}>
              <strong>Document ID:</strong>
              <code style={styles.code}>{result.docId}</code>
            </div>
            <div style={styles.resultItem}>
              <strong>Organization ID:</strong>
              <code style={styles.code}>{result.zohoOrgId}</code>
            </div>
            <div style={styles.resultItem}>
              <strong>Namespace:</strong>
              <code style={styles.code}>{result.namespace}</code>
            </div>
          </div>

          {result.processingResult?.stats && (
            <div style={styles.stats}>
              <h4 style={styles.statsHeader}>📊 Processing Statistics</h4>
              <div style={styles.statsGrid}>
                <div style={styles.statItem}>
                  <div style={styles.statValue}>
                    {result.processingResult.stats.endpoints}
                  </div>
                  <div style={styles.statLabel}>Endpoints</div>
                </div>
                <div style={styles.statItem}>
                  <div style={styles.statValue}>
                    {result.processingResult.stats.intents}
                  </div>
                  <div style={styles.statLabel}>Intents</div>
                </div>
                <div style={styles.statItem}>
                  <div style={styles.statValue}>
                    {result.processingResult.stats.subIntents}
                  </div>
                  <div style={styles.statLabel}>Sub-Intents</div>
                </div>
                <div style={styles.statItem}>
                  <div style={styles.statValue}>
                    {result.processingResult.stats.vectorChunks}
                  </div>
                  <div style={styles.statLabel}>Vector Chunks</div>
                </div>
              </div>
            </div>
          )}

          <div style={styles.nextSteps}>
            <h4 style={styles.nextStepsHeader}>🎯 Next Steps</h4>
            <ol style={styles.stepsList}>
              <li>Configure your Zoho bot webhook to point to your backend</li>
              <li>Start chatting with your bot to query the API documentation</li>
              <li>Your vectors are isolated in namespace: <code style={styles.code}>{result.namespace}</code></li>
            </ol>
          </div>
        </div>
      )}

      {/* Error Details */}
      {result && result.status === "uploaded_processing_failed" && (
        <div style={styles.errorBox}>
          <h3 style={styles.errorHeader}>⚠️ Processing Failed</h3>
          <p>File uploaded successfully but processing encountered an error:</p>
          <code style={styles.errorCode}>{result.processingError}</code>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "40px 20px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
  },
  header: {
    textAlign: "center",
    color: "#fff",
    marginBottom: "10px",
    fontSize: "36px",
    fontWeight: "bold"
  },
  subtitle: {
    textAlign: "center",
    color: "#f0f0f0",
    marginBottom: "40px",
    fontSize: "18px"
  },
  form: {
    maxWidth: "600px",
    margin: "0 auto",
    background: "#fff",
    padding: "40px",
    borderRadius: "12px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
  },
  formGroup: {
    marginBottom: "25px"
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "600",
    color: "#333",
    fontSize: "14px"
  },
  required: {
    color: "#e74c3c"
  },
  input: {
    width: "100%",
    padding: "12px",
    border: "2px solid #e0e0e0",
    borderRadius: "6px",
    fontSize: "14px",
    boxSizing: "border-box",
    transition: "border-color 0.3s"
  },
  fileInput: {
    width: "100%",
    padding: "10px",
    border: "2px dashed #e0e0e0",
    borderRadius: "6px",
    fontSize: "14px",
    boxSizing: "border-box",
    cursor: "pointer"
  },
  hint: {
    display: "block",
    marginTop: "5px",
    fontSize: "12px",
    color: "#666"
  },
  button: {
    width: "100%",
    padding: "14px",
    backgroundColor: "#667eea",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background-color 0.3s",
    marginTop: "10px"
  },
  buttonDisabled: {
    backgroundColor: "#ccc",
    cursor: "not-allowed"
  },
  statusBox: {
    maxWidth: "600px",
    margin: "20px auto",
    padding: "15px",
    background: "#fff",
    borderRadius: "8px",
    textAlign: "center"
  },
  status: {
    fontSize: "16px",
    color: "#333",
    margin: 0
  },
  resultBox: {
    maxWidth: "600px",
    margin: "20px auto",
    padding: "30px",
    background: "#fff",
    borderRadius: "12px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
  },
  resultHeader: {
    color: "#27ae60",
    marginTop: 0,
    marginBottom: "20px",
    fontSize: "24px"
  },
  resultGrid: {
    display: "grid",
    gap: "15px",
    marginBottom: "25px"
  },
  resultItem: {
    padding: "12px",
    background: "#f8f9fa",
    borderRadius: "6px",
    borderLeft: "4px solid #667eea"
  },
  code: {
    display: "block",
    marginTop: "5px",
    padding: "8px",
    background: "#2d3748",
    color: "#68d391",
    borderRadius: "4px",
    fontSize: "13px",
    fontFamily: "monospace",
    wordBreak: "break-all"
  },
  stats: {
    marginTop: "25px",
    padding: "20px",
    background: "#f8f9fa",
    borderRadius: "8px"
  },
  statsHeader: {
    marginTop: 0,
    marginBottom: "15px",
    color: "#333"
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "15px"
  },
  statItem: {
    textAlign: "center",
    padding: "15px",
    background: "#fff",
    borderRadius: "6px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
  },
  statValue: {
    fontSize: "32px",
    fontWeight: "bold",
    color: "#667eea",
    marginBottom: "5px"
  },
  statLabel: {
    fontSize: "12px",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  nextSteps: {
    marginTop: "25px",
    padding: "20px",
    background: "#e8f4fd",
    borderRadius: "8px",
    borderLeft: "4px solid #3498db"
  },
  nextStepsHeader: {
    marginTop: 0,
    marginBottom: "15px",
    color: "#2c3e50"
  },
  stepsList: {
    margin: 0,
    paddingLeft: "20px",
    color: "#34495e"
  },
  errorBox: {
    maxWidth: "600px",
    margin: "20px auto",
    padding: "30px",
    background: "#fff",
    borderRadius: "12px",
    boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
    borderLeft: "4px solid #e74c3c"
  },
  errorHeader: {
    color: "#e74c3c",
    marginTop: 0,
    marginBottom: "15px"
  },
  errorCode: {
    display: "block",
    marginTop: "10px",
    padding: "12px",
    background: "#2d3748",
    color: "#fc8181",
    borderRadius: "4px",
    fontSize: "13px",
    fontFamily: "monospace",
    wordBreak: "break-all"
  }
};

export default App;
