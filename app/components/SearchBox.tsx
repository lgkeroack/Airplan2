'use client'

import { useState, FormEvent } from 'react'

interface SearchBoxProps {
  onSearchLocation: (query: string) => void
}

export default function SearchBox({ onSearchLocation }: SearchBoxProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      onSearchLocation(searchQuery.trim())
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 1001,
        backgroundColor: 'white',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        padding: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: '300px',
      }}
    >
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search location..."
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            boxSizing: 'border-box',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#3b82f6'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#d1d5db'
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#3b82f6'
          }}
        >
          Search
        </button>
      </form>
    </div>
  )
}
