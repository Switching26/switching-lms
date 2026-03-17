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
  const [newMessage, setNewMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)

  // Ensure conversation exists, returns id
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationId) return conversationId
    try {
      const res = await fetch("/api/messages/conversations", { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "Impossible de créer la conversation")
        return null
      }
      const conv = await res.json()
      setConversationId(conv.id)
      return conv.id
    } catch {
      setError("Erreur réseau")
      return null
    }
  }, [conversationId])

  // Init conversation + load messages
  useEffect(() => {
    async function init() {
      try {
        const convId = await ensureConversation()
        if (!convId) return

        const msgRes = await fetch(`/api/messages/conversations/${convId}`)
        if (msgRes.ok) {
          const msgs = await msgRes.json()
          setMessages(msgs)
          if (msgs.length > 0) lastMessageIdRef.current = msgs[msgs.length - 1].id
          fetch(`/api/messages/conversations/${convId}/read`, { method: "PUT" })
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll for new messages
  useEffect(() => {
    if (!conversationId) return
    const interval = setInterval(async () => {
      try {
        const afterParam = lastMessageIdRef.current ? `?after=${lastMessageIdRef.current}` : ""
        const res = await fetch(`/api/messages/conversations/${conversationId}${afterParam}`)
        if (!res.ok) return
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

  // Send message
  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || sending) return
    setSending(true)
    setError("")
    try {
      // Ensure conversation exists before sending
      const convId = await ensureConversation()
      if (!convId) {
        setSending(false)
        return
      }

      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, content: newMessage.trim() }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages((prev) => [...prev, msg])
        lastMessageIdRef.current = msg.id
        setNewMessage("")
      } else {
        const data = await res.json()
        setError(data.error || "Erreur lors de l'envoi")
      }
    } catch {
      setError("Erreur réseau")
    } finally {
      setSending(false)
    }
  }, [newMessage, sending, ensureConversation])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] sm:h-[calc(100vh-120px)] bg-white rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Messages</h1>
        <p className="text-xs text-gray-400 mt-0.5">Échangez avec votre administrateur</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 px-4 py-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">Aucun message. Envoyez le premier !</p>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender.role === "LEARNER"
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div>
                <div
                  className="px-4 py-2.5 max-w-[280px] sm:max-w-[400px] text-sm leading-relaxed"
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
      <div className="px-3 sm:px-4 py-3 border-t border-border flex gap-2">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
          placeholder="Écrivez votre message..."
          rows={1}
          className="flex-1 px-4 py-2.5 text-sm border border-border rounded-2xl outline-none focus:border-gray-400 resize-none"
          style={{ minHeight: 44, maxHeight: 120, fontSize: 16 }}
        />
        <button
          onClick={handleSendMessage}
          disabled={sending || !newMessage.trim()}
          className="px-4 sm:px-5 py-2.5 bg-black text-white text-sm font-medium rounded-full hover:opacity-90 disabled:opacity-40 transition-opacity self-end"
          style={{ minHeight: 44 }}
        >
          {sending ? "..." : "Envoyer"}
        </button>
      </div>
    </div>
  )
}
