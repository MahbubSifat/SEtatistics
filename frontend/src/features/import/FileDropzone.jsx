import { useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import './import.css'

export default function FileDropzone({ onFile, disabled }) {
  const inputRef = useRef(null)
  const [over, setOver] = useState(false)

  return (
    <div
      className={`dz${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0])
      }}
    >
      <p className="dz__title">Drop your Excel file here</p>
      <p className="dz__hint">.xlsx only · the first row must be the column names</p>
      <Button onClick={() => inputRef.current.click()} disabled={disabled}>Choose file</Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files[0]) onFile(e.target.files[0])
          e.target.value = '' // একই file আবার বাছতে পারার জন্য
        }}
      />
    </div>
  )
}