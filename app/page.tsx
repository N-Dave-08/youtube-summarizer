"use client";

import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const handleSummarize = async () => {
    setLoading(true);
    setResponse("");
    setProgress(0);
    try {
      const res = await fetch("http://localhost:5000/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!data.jobId) throw new Error("No jobId returned");
      const jobId = data.jobId;
      // Poll progress
      pollingRef.current = setInterval(async () => {
        try {
          const resp = await fetch(`http://localhost:5000/progress/${jobId}`);
          if (!resp.ok) throw new Error('Progress fetch failed');
          const progData = await resp.json();
          setProgress(progData.progress);
          if (progData.progress >= 100 || progData.progress === -1) {
            clearInterval(pollingRef.current!);
            setLoading(false);
            setResponse(progData.progress === 100 ? progData.summary || "Done!" : "Error");
          }
        } catch (err) {
          clearInterval(pollingRef.current!);
          setLoading(false);
          setProgress(-1);
          setResponse("Error: Could not connect to backend for progress updates.");
        }
      }, 1000);
    } catch (error: any) {
      setResponse("Error: " + error.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Transcript Summarizer</h1>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="w-full h-48 p-4 border rounded mb-4"
        placeholder="Paste your transcript or text here..."
      />
      <Button
        onClick={handleSummarize}
        disabled={loading}
      >
        {loading ? "Summarizing..." : "Summarize"}
      </Button>

      {/* Progress Indicator */}
      {loading && (
        <div className="mt-6">
          <Progress className="w-full h-3" value={progress} />
          <div className="text-center text-sm text-muted-foreground mt-2">
            {progress === -1 ? "Error" : progress >= 100 ? "Done!" : `Processing... (${progress}%)`}
          </div>
        </div>
      )}

      {response && (
        <div className="mt-6 bg-gray-100 p-4 rounded">
          <h2 className="font-semibold mb-2">Response:</h2>
          <p className="whitespace-pre-wrap">{response}</p>
        </div>
      )}
    </main>
  );
}
