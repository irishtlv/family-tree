import { useState } from 'react'
import { api } from '../api'
import { useStore } from '../store'

/** Live mode only: sign in with a one-time code sent by email. No passwords. */
export function Login() {
  const { reload } = useStore()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="login">
      <div className="card-login">
        <img src={import.meta.env.BASE_URL + "icon.svg"} alt="" width={56} height={56} />
        <h1>עץ המשפחה</h1>
        {!sent ? (
          <form onSubmit={async e => {
            e.preventDefault(); setBusy(true); setErr('')
            try { await api.sendCode!(email.trim()); setSent(true) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
          }}>
            <p>נכנסים עם המייל שאליו קיבלת את ההזמנה. נשלח אלייך קוד כניסה.</p>
            <label className="fl">מייל<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" /></label>
            <button className="btn pri wide" disabled={busy}>שליחת קוד</button>
          </form>
        ) : (
          <form onSubmit={async e => {
            e.preventDefault(); setBusy(true); setErr('')
            try { await api.verifyCode!(email.trim(), code.trim()); await reload() } catch (x) { setErr('הקוד לא נכון או שפג תוקפו') } finally { setBusy(false) }
          }}>
            <p>שלחנו קוד ל-<b dir="ltr">{email}</b>. אפשר גם ללחוץ על הקישור שבמייל.</p>
            <label className="fl">קוד<input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} dir="ltr" /></label>
            <button className="btn pri wide" disabled={busy}>כניסה</button>
            <button type="button" className="btn wide" onClick={() => setSent(false)}>שינוי מייל</button>
          </form>
        )}
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  )
}

export function NotInvited() {
  const { reload } = useStore()
  return (
    <div className="login"><div className="card-login">
      <h1>עוד לא הוזמנת</h1>
      <p>נכנסת בהצלחה, אבל המייל הזה עוד לא הוזמן לעץ. בקשו מהמנהלת לשלוח לכם הזמנה, ואז היכנסו שוב.</p>
      <button type="button" className="btn wide" onClick={async () => { await api.signOut?.(); await reload() }}>יציאה</button>
    </div></div>
  )
}
