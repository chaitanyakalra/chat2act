
import fetch from 'node-fetch';

async function trigger() {
    console.log("Triggering webhook...");
    const response = await fetch('http://localhost:5000/chatbot/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            handler: "trigger",
            request: {
                id: "test_" + Date.now(), // Unique ID each time
                os: "Windows",
                location: { country: "India" }
            },
            org_id: "test_org",
            visitor: {
                email: "test@test.com",
                name: "Test User"
            },
            operation: "chat"
        })
    });

    console.log("Response status:", response.status);
    const text = await response.text();
    console.log("Response body:", text);
}

trigger();
