"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface Message {
  id: string
  content: string
  senderId: string
  createdAt: string
  sender: { id: string; firstName: string; lastName: string; role: string }
}

export default function LearnerMessagesPage() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)

  // Init conversation
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/messages/conversations", { method: "POST" })
        const conv = await res.json()
        setConversationId(conv.id)

        const msgRes = await fetch(`/api/messages/conversations/${conv.id}`)
        const msgs = await msgRes.json()
        setMessages(msgs)
        if (msgs.length > 0) lastMessageIdRef.current = msgs[msgs.length - 1].id

        // Mark as read
        fetch(`/api/messages/conversations/${conv.id}/read`, { method: "PUT" })
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Poll for new messages
  useEffect(() => {
    if (!conversationId) return
    const interval = setInterval(async () => {
      try {
        const afterParam = lastMessageIdRef.current ? `?after=${lastMessageIdRef.current}` : ""
        const res = await fetch(`/api/messages/conversations/${conversationId}${afterParam}`)
        const newMsgs: Message[] = await res.json()
        if (newMsgs.length > 0) {
          setMessages((prev) => [...prev, ...newMsgs])
          lastMessageIdRef.current = newMsgs[newMsgs.length - 1].id
          fetch(`/api/messages/conversations/${conversationId}/read`, { method: "PUT" })
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [conversationId])

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !conversationId || sending) return
    setSending(true)
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content: input.trim() }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages((prev) => [...prev, msg])
        lastMessageIdRef.current = msg.id
        setInput("")
      }
    } finally {
      setSending(false)
    }
  }, [input, conversationId, sending])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] bg-white rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Messages</h1>
        <p className="text-xs text-gray-400 mt-0.5">Échangez avec votre administrateur</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">Aucun message. Envoyez le premier !</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender.role === "LEARNER"
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div>
                <div
                  className="px-4 py-2.5 max-w-[400px] text-sm leading-relaxed"
                  style={{
                    borderRadius: 18,
                    backgroundColor: isMe ? "#111111" : "#F5F5F7",
                    color: isMe ? "#ffffff" : "#111111",
                  }}
                >
                  {msg.content}
                </div>
                <p className={`text-[10px] text-gray-400 mt-1 ${isMe ? "text-right" : "text-left"}`}>
                  {new Date(msg.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Votre message..."
          className="flex-1 px-4 py-2.5 text-sm border border-border rounded-full outline-none focus:border-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="px-5 py-2.5 bg-black text-white text-sm font-medium rounded-full hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          Envoyer
        </button>
      </div>
    </div>
  )
}
