import { useState, useMemo, useRef } from 'react'
import Spline from '@splinetool/react-spline'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function FileDropzone({ onFiles }) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) {
      onFiles(files)
    }
  }

  const handleInput = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length) onFiles(files)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-6 transition-colors ${isDragging ? 'border-blue-400 bg-blue-500/10' : 'border-white/20 bg-white/5'}`}
    >
      <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleInput} />
      <div className="text-center">
        <p className="text-white/80">Drag & drop documents here or click to browse</p>
        <p className="text-xs text-white/50 mt-1">PDF, DOCX, TXT supported. We auto-chunk and embed on upload.</p>
      </div>
    </div>
  )
}

function UploadItem({ file, status }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: status === 'done' ? '#22c55e' : status === 'error' ? '#ef4444' : '#60a5fa' }} />
        <span className="text-white/90 text-sm truncate max-w-[200px]">{file.name}</span>
      </div>
      <span className="text-xs text-white/60">{status}</span>
    </div>
  )
}

function QueryBox({ onQuery, loading, results }) {
  const [q, setQ] = useState('')

  const handleAsk = () => {
    if (!q.trim()) return
    onQuery(q)
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your documents..."
          className="flex-1 bg-transparent outline-none text-white placeholder-white/40 px-3 py-2"
        />
        <button onClick={handleAsk} disabled={loading} className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50">Ask</button>
      </div>
      {results?.length > 0 && (
        <div className="mt-4 space-y-3 max-h-64 overflow-auto">
          {results.map((r, i) => (
            <div key={i} className="bg-black/20 rounded-lg p-3 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-xs text-white/50">Score: {r.score.toFixed(3)}</span>
                {r.title && <span className="text-xs text-white/50">{r.title}</span>}
              </div>
              <p className="text-white/90 text-sm mt-1 whitespace-pre-wrap">{r.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AgentBox() {
  const [prompt, setPrompt] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [events, setEvents] = useState([])
  const abortRef = useRef(null)

  const startAgent = async () => {
    if (!prompt.trim()) return
    setEvents([])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${BACKEND_URL}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, top_k: 5 }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error('Failed to start stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const chunk of parts) {
          const line = chunk.trim().split('\n').find(l => l.startsWith('data:'))
          if (!line) continue
          const payload = line.replace(/^data:\s*/, '')
          if (payload === '[DONE]') {
            setEvents(prev => [...prev, { type: 'done' }])
            break
          }
          try {
            const obj = JSON.parse(payload)
            setEvents(prev => [...prev, obj])
          } catch {}
        }
      }
    } catch (e) {
      setEvents(prev => [...prev, { type: 'error', value: e.message }])
    } finally {
      setStreaming(false)
    }
  }

  const stopAgent = () => {
    abortRef.current?.abort()
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask the Agent to research using your docs..."
          className="flex-1 bg-transparent outline-none text-white placeholder-white/40 px-3 py-2"
        />
        {!streaming ? (
          <button onClick={startAgent} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white">Run</button>
        ) : (
          <button onClick={stopAgent} className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white">Stop</button>
        )}
      </div>

      <div className="mt-4 max-h-64 overflow-auto space-y-2">
        {events.map((ev, i) => (
          <div key={i} className="text-sm text-white/90 bg-black/20 border border-white/10 rounded p-2">
            {ev.type === 'status' && <p className="text-white/70">{ev.value}</p>}
            {ev.type === 'thought' && <p className="text-blue-300">{ev.value}</p>}
            {ev.type === 'retrieved' && <p className="text-white/70">Retrieved {ev.count} snippets</p>}
            {ev.type === 'context' && (
              <div>
                <p className="text-white/60">Context #{ev.index + 1}</p>
                <p className="text-white/90 whitespace-pre-wrap">{ev.snippet}</p>
              </div>
            )}
            {ev.type === 'final' && (
              <div>
                <p className="font-semibold text-emerald-300">Answer</p>
                <p className="whitespace-pre-wrap">{ev.answer}</p>
              </div>
            )}
            {ev.type === 'error' && <p className="text-red-400">{ev.value}</p>}
            {ev.type === 'done' && <p className="text-white/50 italic">Done</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  const [uploads, setUploads] = useState([])
  const [queryLoading, setQueryLoading] = useState(false)
  const [results, setResults] = useState([])

  const sceneUrl = useMemo(() => 'https://prod.spline.design/xVcGsBa0crFDHR-t/scene.splinecode', [])

  const handleFiles = async (files) => {
    const items = files.map(f => ({ file: f, status: 'queued' }))
    setUploads(prev => [...items, ...prev])

    for (const item of items) {
      setUploads(prev => prev.map(u => u.file === item.file ? { ...u, status: 'uploading' } : u))
      const form = new FormData()
      form.append('file', item.file)
      form.append('title', item.file.name)
      try {
        const res = await fetch(`${BACKEND_URL}/ingest`, { method: 'POST', body: form })
        if (!res.ok) throw new Error('Upload failed')
        await res.json()
        setUploads(prev => prev.map(u => u.file === item.file ? { ...u, status: 'done' } : u))
      } catch (e) {
        setUploads(prev => prev.map(u => u.file === item.file ? { ...u, status: 'error' } : u))
      }
    }
  }

  const runQuery = async (q) => {
    setQueryLoading(true)
    setResults([])
    try {
      const res = await fetch(`${BACKEND_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, top_k: 5 })
      })
      const data = await res.json()
      setResults(data.results || [])
    } catch (e) {
      console.error(e)
    } finally {
      setQueryLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white relative">
      <div className="absolute inset-0">
        <Spline scene={sceneUrl} style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/70 to-slate-950/95 pointer-events-none" />

      <header className="relative z-10 pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
              Agentic RAG for your documents
            </h1>
            <p className="mt-4 text-white/70 text-lg">
              Drop files, we optimally chunk and embed them automatically. Ask questions and get relevant answers fast.
            </p>
          </div>
          <div className="mt-8 grid lg:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-6">
            <div className="bg-black/30 backdrop-blur border border-white/10 rounded-2xl p-5 lg:col-span-1 col-span-1">
              <FileDropzone onFiles={handleFiles} />
              <div className="mt-4 divide-y divide-white/10">
                {uploads.length === 0 && <p className="text-sm text-white/50">No uploads yet.</p>}
                {uploads.map((u, idx) => (
                  <UploadItem key={idx} file={u.file} status={u.status} />
                ))}
              </div>
            </div>
            <div className="bg-black/30 backdrop-blur border border-white/10 rounded-2xl p-5 lg:col-span-1 col-span-1">
              <QueryBox onQuery={runQuery} loading={queryLoading} results={results} />
            </div>
            <div className="bg-black/30 backdrop-blur border border-white/10 rounded-2xl p-5 lg:col-span-1 col-span-1">
              <AgentBox />
            </div>
          </div>
        </div>
      </header>

      <footer className="relative z-10 py-8">
        <div className="max-w-6xl mx-auto px-6 text-white/50 text-sm">
          Built with an interactive 3D industrial theme.
        </div>
      </footer>
    </div>
  )
}

export default App
