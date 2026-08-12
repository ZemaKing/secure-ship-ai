import './Pagination.scss'

interface PaginationProps {
  page: number
  totalItems: number
  pageSize: number
  itemLabel: string
  onPageChange: (page: number) => void
}

// Always keeps first/last/current±1 visible, collapsing everything else into
// a single ellipsis — matches admin-pages.png's "1 2 3 … 169" shape rather
// than listing every page.
function getPageNumbers(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const keep = new Set<number>([1, totalPages, page - 1, page, page + 1])
  const sortedPages = [...keep].filter((candidate) => candidate >= 1 && candidate <= totalPages).sort((a, b) => a - b)

  const result: (number | 'ellipsis')[] = []
  let previous = 0
  for (const candidate of sortedPages) {
    if (previous && candidate - previous > 1) result.push('ellipsis')
    result.push(candidate)
    previous = candidate
  }
  return result
}

function Pagination({ page, totalItems, pageSize, itemLabel, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(Math.max(1, page), totalPages)
  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const rangeEnd = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="pagination">
      <p className="pagination__summary">
        Showing {rangeStart} to {rangeEnd} of {totalItems} {itemLabel}
      </p>
      {totalPages > 1 && (
        <div className="pagination__controls">
          <button
            type="button"
            className="pagination__nav"
            aria-label="Previous page"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            «
          </button>
          {getPageNumbers(currentPage, totalPages).map((entry, index) =>
            entry === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="pagination__ellipsis">
                …
              </span>
            ) : (
              <button
                type="button"
                key={entry}
                className={`pagination__page${entry === currentPage ? ' pagination__page--active' : ''}`}
                aria-label={`Page ${entry}`}
                aria-current={entry === currentPage ? 'page' : undefined}
                onClick={() => onPageChange(entry)}
              >
                {entry}
              </button>
            ),
          )}
          <button
            type="button"
            className="pagination__nav"
            aria-label="Next page"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            »
          </button>
        </div>
      )}
    </div>
  )
}

export default Pagination
