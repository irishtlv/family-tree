import { useEffect, useRef, type ReactNode } from 'react'

/** Native <dialog>: focus trap, Esc to close, works on phones. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    d.showModal()
    const c = () => onClose()
    d.addEventListener('close', c)
    return () => { d.removeEventListener('close', c); if (d.open) d.close() }
  }, [onClose])
  return (
    <dialog ref={ref}>
      <div className="dlg">
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  )
}
