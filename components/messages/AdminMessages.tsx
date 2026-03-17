"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface ConversationSummary {
  id: string
  learner: { id: string; firstName: string; lastName: string; email: string }
  admin: { id: string; firstName: string; lastName: string; email: string }
  lastMessage: { content: string; createdAt: string; senderId: string } | null
  isRead: boolean
  updatedAt: string
}

interface Message {
  id: string
  content: string
  senderId: string
  createdAt: string
  sender: { id: string; firstName: string; lastName: string; role: string }
}

export default function AdminMessages() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/conversations")
      if (res.ok) {
        const data = await res.json()
        setConversations(data)
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadConversations().then(() => setLoading(false))
  }, [loadConversations])

  // Poll conversations list
  useEffect(() => {
    const interval = setInterval(loadConversations, 3000)
    return () => clearInterval(interval)
  }, [loadConversations])

  // Load messages for active conversation
  const openConversation = useCallback(async (id: string) => {
    setActiveId(id)
    lastMessageIdRef.current = null
    const res = await fetch(`/api/messages/conversations/${id}`)
    const msgs: Message[] = await res.json()
    setMessages(msgs)
    if (msgs.length > 0) lastMessageIdRef.current = msgs[msgs.length - 1].id
    fetch(`/api/messages/conversations/${id}/read`, { method: "PUT" })
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, isRead: true } : c))
  }, [])

  // Poll active conversation messages
  useEffect(() => {
    if (!activeId) return
    const interval = setInterval(async () => {
      try {
        const afterParam = lastMessageIdRef.current ? `?after=${lastMessageIdRef.current}` : ""
        const res = await fetch(`/api/messages/conversations/${activeId}${afterParam}`)
        const newMsgs: Message[] = await res.json()
        if (newMsgs.length > 0) {
          setMessages((prev) => [...prev, ...newMsgs])
          lastMessageIdRef.current = newMsgs[newMsgs.length - 1].id
          fetch(`/api/messages/conversations/${activeId}/read`, { method: "PUT" })
        }
      } catch {}
    }, 3000)
    return () => clearInterval(interval)
  }, [activeId])

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeId || sending) return
    setSending(true)
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, content: input.trim() }),
      })
      if (res.ok) {
        const msg = await res.json()
        setMessages((prev) => [...prev, msg])
        lastMessageIdRef.current = msg.id
        setInput("")
        loadConversations()
      }
    } finally {
      setSending(false)
    }
  }, [input, activeId, sending, loadConversations])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-120px)] bg-white rounded-xl border border-border overflow-hidden">
      {/* Conversation list - full width on mobile when no active, side panel on desktop */}
      <div className={`${activeId ? "hidden md:flex" : "flex"} w-full md:w-80 border-r border-border flex-col`}>
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Conversations</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-8 px-4">Aucune conversation</p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => openConversation(conv.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                activeId === conv.id ? "bg-gray-50" : ""
              }`}
              style={{ minHeight: 44 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {conv.learner.firstName} {conv.learner.lastName}
                </span>
                <div className="flex items-center gap-2">
                  {!conv.isRead && (
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                  <span className="text-[10px] text-gray-400">
                    {conv.lastMessage ? new Date(conv.lastMessage.createdAt).toLocaleDateString("fr-FR", {
                      day: "2-digit", month: "2-digit",
                    }) : ""}
                  </span>
                </div>
              </div>
              {conv.lastMessage && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {conv.lastMessage.content.substring(0, 60)}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className={`${activeId ? "flex" : "hidden md:flex"} flex-1 flex-col`}>
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">Sélectionnez une conversation</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-4 sm:px-6 py-3 border-b border-border flex items-center gap-3">
              <button
                onClick={() => setActiveId(null)}
                className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              {(() => {
                const conv = conversations.find((c) => c.id === activeId)
                return conv ? (
                  <div>
                    <p className="text-sm font-semibold">{conv.learner.firstName} {conv.learner.lastName}</p>
                    <p className="text-xs text-gray-400">{conv.learner.email}</p>
                  </div>
                ) : null
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-gray-400 text-center mt-8">Aucun message</p>
              )}
              {messages.map((msg) => {
                const isAdmin = msg.sender.role !== "LEARNER"
                return (
                  <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div>
                      <div
                        className="px-4 py-2.5 max-w-[280px] sm:max-w-[400px] text-sm leading-relaxed"
                        style={{
                          borderRadius: 18,
                          backgroundColor: isAdmin ? "#111111" : "#F5F5F7",
                          color: isAdmin ? "#ffffff" : "#111111",
                        }}
                      >
                        {msg.content}
                      </div>
                      <p className={`text-[10px] text-gray-400 mt-1 ${isAdmin ? "text-right" : "text-left"}`}>
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
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Votre réponse..."
                rows={1}
                className="flex-1 px-4 py-2.5 text-sm border border-border rounded-2xl outline-none focus:border-gray-400 resize-none"
                style={{ minHeight: 44, maxHeight: 120, fontSize: 16 }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="px-4 sm:px-5 py-2.5 bg-black text-white text-sm font-medium rounded-full hover:opacity-90 disabled:opacity-40 transition-opacity self-end"
                style={{ minHeight: 44 }}
              >
                {sending ? "..." : "Envoyer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
