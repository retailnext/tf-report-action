import { describe, expect, test, afterEach, jest } from '@jest/globals'
import type { IncomingMessage, ClientRequest } from 'https'
import {
  httpsRequest,
  getExistingComments,
  deleteComment,
  postComment,
  searchIssues,
  createIssue,
  updateIssue,
  _setRequestImpl,
  _resetRequestImpl
} from '../src/github'

// Helper to create a mock response
function createMockResponse(statusCode: number, data: string): IncomingMessage {
  const response = {
    statusCode,
    on: (event: string, handler: (data?: unknown) => void) => {
      if (event === 'data') {
        setImmediate(() => handler(Buffer.from(data)))
      } else if (event === 'end') {
        setImmediate(() => handler())
      }
      return response
    }
  } as unknown as IncomingMessage
  return response
}

// Helper to create a mock request
function createMockRequest(): ClientRequest {
  const request = {
    on: () => {
      // Don't trigger error by default
      return request
    },
    write: jest.fn(),
    end: jest.fn()
  } as unknown as ClientRequest
  return request
}

describe('httpsRequest', () => {
  afterEach(() => {
    _resetRequestImpl()
  })

  test('resolves with response body on successful request', async () => {
    const mockResponse = createMockResponse(200, '{"success": true}')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    const result = await httpsRequest({
      hostname: 'api.github.com',
      path: '/test'
    })

    expect(result).toBe('{"success": true}')
    expect(mockReq.end).toHaveBeenCalled()
  })

  test('writes data when provided', async () => {
    const mockResponse = createMockResponse(201, '{"created": true}')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await httpsRequest(
      { hostname: 'api.github.com', path: '/test' },
      '{"key": "value"}'
    )

    expect(mockReq.write).toHaveBeenCalledWith('{"key": "value"}')
    expect(mockReq.end).toHaveBeenCalled()
  })

  test('rejects on HTTP error status', async () => {
    const mockResponse = createMockResponse(404, 'Not Found')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await expect(
      httpsRequest({ hostname: 'api.github.com', path: '/test' })
    ).rejects.toThrow('HTTP 404: Not Found')
  })

  test('rejects on request error', async () => {
    const mockReq = {
      on: (event: string, handler: (error?: Error) => void) => {
        if (event === 'error') {
          setImmediate(() => handler(new Error('Network error')))
        }
        return mockReq
      },
      write: jest.fn(),
      end: jest.fn()
    } as unknown as ClientRequest

    _setRequestImpl(() => mockReq)

    await expect(
      httpsRequest({ hostname: 'api.github.com', path: '/test' })
    ).rejects.toThrow('Network error')
  })

  test('handles multiple data chunks', async () => {
    const response = {
      statusCode: 200,
      on: (event: string, handler: (data?: unknown) => void) => {
        if (event === 'data') {
          setImmediate(() => {
            handler(Buffer.from('{"first": '))
            handler(Buffer.from('"chunk"}'))
          })
        } else if (event === 'end') {
          setImmediate(() => handler())
        }
        return response
      }
    } as unknown as IncomingMessage

    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(response))
      }
      return mockReq
    })

    const result = await httpsRequest({
      hostname: 'api.github.com',
      path: '/test'
    })

    expect(result).toBe('{"first": "chunk"}')
  })
})

describe('getExistingComments', () => {
  afterEach(() => {
    _resetRequestImpl()
  })

  test('returns parsed comments array', async () => {
    const mockComments = [
      { id: 1, body: 'Comment 1' },
      { id: 2, body: 'Comment 2' }
    ]
    const mockResponse = createMockResponse(200, JSON.stringify(mockComments))
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      // Verify correct path and method
      expect(options.path).toBe('/repos/owner/repo/issues/123/comments')
      expect(options.method).toBe('GET')
      expect(options.hostname).toBe('api.github.com')

      const headers = options.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer test-token')
      expect(headers['User-Agent']).toBe('tf-report-action')
      expect(headers.Accept).toBe('application/vnd.github+json')

      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    const result = await getExistingComments('test-token', 'repo', 'owner', 123)

    expect(result).toEqual(mockComments)
    expect(result.length).toBe(2)
    expect(result[0].id).toBe(1)
  })
})

describe('deleteComment', () => {
  afterEach(() => {
    _resetRequestImpl()
  })

  test('sends DELETE request to correct endpoint', async () => {
    const mockResponse = createMockResponse(204, '')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      expect(options.path).toBe('/repos/owner/repo/issues/comments/456')
      expect(options.method).toBe('DELETE')
      expect(options.hostname).toBe('api.github.com')

      const headers = options.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer test-token')

      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await deleteComment('test-token', 'repo', 'owner', 456)
    expect(mockReq.end).toHaveBeenCalled()
  })
})

describe('postComment', () => {
  afterEach(() => {
    _resetRequestImpl()
  })

  test('sends POST request with comment body', async () => {
    const mockResponse = createMockResponse(201, '{"id": 789}')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      expect(options.path).toBe('/repos/owner/repo/issues/123/comments')
      expect(options.method).toBe('POST')

      const headers = options.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')
      expect(headers.Authorization).toBe('Bearer test-token')

      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await postComment('test-token', 'repo', 'owner', 123, 'Test comment')

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ body: 'Test comment' })
    )
  })
})

describe('searchIssues', () => {
  afterEach(() => {
    _resetRequestImpl()
  })

  test('returns search results', async () => {
    const mockResults = {
      items: [
        { number: 1, title: 'Issue 1', body: 'Body 1' },
        { number: 2, title: 'Issue 2', body: 'Body 2' }
      ]
    }
    const mockResponse = createMockResponse(200, JSON.stringify(mockResults))
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      expect(options.path).toContain('/search/issues?q=')
      expect(options.path).toContain('test%20query')
      expect(options.method).toBe('GET')

      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    const result = await searchIssues(
      'test-token',
      'repo',
      'owner',
      'test query'
    )

    expect(result).toEqual(mockResults.items)
    expect(result.length).toBe(2)
  })

  test('returns empty array when no items', async () => {
    const mockResponse = createMockResponse(200, '{}')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    const result = await searchIssues(
      'test-token',
      'repo',
      'owner',
      'test query'
    )

    expect(result).toEqual([])
  })

  test('throws error on invalid JSON response', async () => {
    const mockResponse = createMockResponse(200, 'invalid json')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await expect(
      searchIssues('test-token', 'repo', 'owner', 'test query')
    ).rejects.toThrow('Failed to parse search issues response')
  })

  test('throws error with non-Error exception converted to string', async () => {
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      // Mock a response that will cause JSON.parse to throw
      const response = {
        statusCode: 200,
        on: (event: string, handler: (data?: unknown) => void) => {
          if (event === 'data') {
            setImmediate(() => handler(Buffer.from('{"invalid')))
          } else if (event === 'end') {
            setImmediate(() => handler())
          }
          return response
        }
      } as unknown as IncomingMessage

      if (callback) {
        setImmediate(() => callback(response))
      }
      return mockReq
    })

    await expect(
      searchIssues('test-token', 'repo', 'owner', 'test query')
    ).rejects.toThrow('Failed to parse search issues response')
  })

  test('encodes query parameters correctly', async () => {
    const mockResponse = createMockResponse(200, '{"items": []}')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      // Check that special characters are encoded
      expect(options.path).toContain(
        encodeURIComponent('repo:owner/repo is:issue')
      )

      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await searchIssues(
      'test-token',
      'repo',
      'owner',
      'repo:owner/repo is:issue'
    )
  })
})

describe('createIssue', () => {
  afterEach(() => {
    _resetRequestImpl()
  })

  test('returns issue number on success', async () => {
    const mockIssue = { number: 123, title: 'Test Issue' }
    const mockResponse = createMockResponse(201, JSON.stringify(mockIssue))
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      expect(options.path).toBe('/repos/owner/repo/issues')
      expect(options.method).toBe('POST')

      const headers = options.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')

      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    const result = await createIssue(
      'test-token',
      'repo',
      'owner',
      'Test Title',
      'Test Body'
    )

    expect(result).toBe(123)
    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ title: 'Test Title', body: 'Test Body' })
    )
  })

  test('throws error when response missing issue number', async () => {
    const mockResponse = createMockResponse(201, '{}')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await expect(
      createIssue('test-token', 'repo', 'owner', 'Test Title', 'Test Body')
    ).rejects.toThrow('Failed to parse create issue response')
  })

  test('throws error on invalid JSON response', async () => {
    const mockResponse = createMockResponse(201, 'invalid json')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await expect(
      createIssue('test-token', 'repo', 'owner', 'Test Title', 'Test Body')
    ).rejects.toThrow('Failed to parse create issue response')
  })

  test('throws error with non-Error exception converted to string', async () => {
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      // Mock a response that will cause JSON.parse to throw
      const response = {
        statusCode: 201,
        on: (event: string, handler: (data?: unknown) => void) => {
          if (event === 'data') {
            setImmediate(() => handler(Buffer.from('{"number":')))
          } else if (event === 'end') {
            setImmediate(() => handler())
          }
          return response
        }
      } as unknown as IncomingMessage

      if (callback) {
        setImmediate(() => callback(response))
      }
      return mockReq
    })

    await expect(
      createIssue('test-token', 'repo', 'owner', 'Test Title', 'Test Body')
    ).rejects.toThrow('Failed to parse create issue response')
  })
})

describe('updateIssue', () => {
  afterEach(() => {
    _resetRequestImpl()
  })

  test('sends PATCH request with title and body', async () => {
    const mockResponse = createMockResponse(200, '{"id": 123}')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      expect(options.path).toBe('/repos/owner/repo/issues/123')
      expect(options.method).toBe('PATCH')

      const headers = options.headers as Record<string, string>
      expect(headers['Content-Type']).toBe('application/json')

      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    await updateIssue(
      'test-token',
      'repo',
      'owner',
      123,
      'Updated Title',
      'Updated Body'
    )

    expect(mockReq.write).toHaveBeenCalledWith(
      JSON.stringify({ title: 'Updated Title', body: 'Updated Body' })
    )
  })

  test('completes successfully', async () => {
    const mockResponse = createMockResponse(200, '{"id": 456}')
    const mockReq = createMockRequest()

    _setRequestImpl((options, callback) => {
      if (callback) {
        setImmediate(() => callback(mockResponse))
      }
      return mockReq
    })

    // Should not throw
    await expect(
      updateIssue('test-token', 'repo', 'owner', 456, 'Title', 'Body')
    ).resolves.toBeUndefined()
  })
})
