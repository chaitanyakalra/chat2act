import React, { useState } from "react";
import axios from "axios";
import OnboardingPortal from "./Components/OnboardingPortal";

function App() {
  // const handleFileChange = (e) => {
  //   setFile(e.target.files[0]);
  // };

  // const uploadFile = async () => {
  //   if (!file) {
  //     alert("Please select a file first");
  //     return;
  //   }

  //   const formData = new FormData();
  //   formData.append("file", file);

  //   try {
  //     setLoading(true);
  //     setStatus("Uploading file…");

  //     const res = await axios.post(
  //       "http://localhost:5000/api/upload-doc",
  //       formData,
  //       {
  //         headers: { "Content-Type": "multipart/form-data" }
  //       }
  //     );

  //     setStatus("File uploaded! Starting processing…");

  //     // For now, backend only uploads.
  //     // Later we will trigger extraction using docId.
  //     setTimeout(() => {
  //       setStatus(`Processing complete! Doc ID: ${res.data.docId}`);
  //       setLoading(false);
  //     }, 1000);

  //   } catch (err) {
  //     setStatus("Error uploading file");
  //     setLoading(false);
  //     console.error(err);
  //   }
  // };

  return <OnboardingPortal />;
}

export default App;
