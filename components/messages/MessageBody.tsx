import { correctionLabels, readCorrection } from "./content"
export default function MessageBody({ content, conversationId, messageId }: { content: string; conversationId: string; messageId: string }) {
  const correction = readCorrection(content)
  if (!correction) return <p className="whitespace-pre-wrap break-words">{content}</p>
  return <div className="space-y-2 break-words">
    {correction.text && <p className="whitespace-pre-wrap">{correction.text}</p>}
    {correction.file && <a className="block underline min-h-11 py-2 break-all"
      href={`/api/messages/conversations/${conversationId}/files/${messageId}`}>{correction.file.name}</a>}
    <p className="text-xs font-medium">{correctionLabels[correction.status]}</p>
  </div>
}
