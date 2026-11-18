import Button from './Button'
import Icon from './Icon'
import './Pagination.css'

export default function Pagination({ page, pageSize, total, onChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)

  return (
    <nav className="pager" aria-label="Pagination">
      <p className="pager__info num">{from}–{to} of {total}</p>
      <div className="pager__ctrl">
        <Button variant="ghost" className="btn--sm" onClick={() => onChange(page - 1)} disabled={page === 0}>
          <Icon name="chevron-left" size={16} /> Previous
        </Button>
        <span className="pager__page num">{page + 1} / {pageCount}</span>
        <Button className="btn--sm" onClick={() => onChange(page + 1)} disabled={page >= pageCount - 1}>
          Next <Icon name="chevron-right" size={16} />
        </Button>
      </div>
    </nav>
  )
}