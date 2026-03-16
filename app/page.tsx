export default function HomePage() {
  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <h1>Switching LMS - OK</h1>
      <p>Le serveur fonctionne.</p>
      <ul>
        <li><a href="/login">Page de connexion</a></li>
        <li><a href="/api/health">Health check (diagnostic)</a></li>
      </ul>
    </div>
  )
}
