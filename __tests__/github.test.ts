import { describe, expect, test } from '@jest/globals'
import {
  httpsRequest,
  getExistingComments,
  deleteComment,
  postComment,
  searchIssues,
  createIssue,
  updateIssue
} from '../src/github'

describe('github module exports', () => {
  test('httpsRequest is exported as a function', () => {
    expect(typeof httpsRequest).toBe('function')
    expect(httpsRequest.name).toBe('httpsRequest')
  })

  test('getExistingComments is exported as a function', () => {
    expect(typeof getExistingComments).toBe('function')
    expect(getExistingComments.name).toBe('getExistingComments')
  })

  test('deleteComment is exported as a function', () => {
    expect(typeof deleteComment).toBe('function')
    expect(deleteComment.name).toBe('deleteComment')
  })

  test('postComment is exported as a function', () => {
    expect(typeof postComment).toBe('function')
    expect(postComment.name).toBe('postComment')
  })

  test('searchIssues is exported as a function', () => {
    expect(typeof searchIssues).toBe('function')
    expect(searchIssues.name).toBe('searchIssues')
  })

  test('createIssue is exported as a function', () => {
    expect(typeof createIssue).toBe('function')
    expect(createIssue.name).toBe('createIssue')
  })

  test('updateIssue is exported as a function', () => {
    expect(typeof updateIssue).toBe('function')
    expect(updateIssue.name).toBe('updateIssue')
  })
})

describe('github module function signatures', () => {
  test('httpsRequest accepts RequestOptions and optional data', () => {
    // This test verifies the function accepts the correct parameters
    // We're not calling it to avoid making actual HTTP requests
    expect(httpsRequest.length).toBe(2) // Two parameters: options and data
  })

  test('getExistingComments accepts token, repo, owner, and issueNumber', () => {
    expect(getExistingComments.length).toBe(4)
  })

  test('deleteComment accepts token, repo, owner, and commentId', () => {
    expect(deleteComment.length).toBe(4)
  })

  test('postComment accepts token, repo, owner, issueNumber, and body', () => {
    expect(postComment.length).toBe(5)
  })

  test('searchIssues accepts token, repo, owner, and query', () => {
    expect(searchIssues.length).toBe(4)
  })

  test('createIssue accepts token, repo, owner, title, and body', () => {
    expect(createIssue.length).toBe(5)
  })

  test('updateIssue accepts token, repo, owner, issueNumber, title, and body', () => {
    expect(updateIssue.length).toBe(6)
  })
})

describe('github module return types', () => {
  test('httpsRequest returns a Promise', () => {
    const result = httpsRequest({ hostname: 'api.github.com', path: '/test' })
    expect(result instanceof Promise).toBe(true)
    // Clean up the promise to avoid unhandled rejection
    result.catch(() => {})
  })

  test('getExistingComments returns a Promise', () => {
    const result = getExistingComments('token', 'repo', 'owner', 1)
    expect(result instanceof Promise).toBe(true)
    result.catch(() => {})
  })

  test('deleteComment returns a Promise', () => {
    const result = deleteComment('token', 'repo', 'owner', 1)
    expect(result instanceof Promise).toBe(true)
    result.catch(() => {})
  })

  test('postComment returns a Promise', () => {
    const result = postComment('token', 'repo', 'owner', 1, 'body')
    expect(result instanceof Promise).toBe(true)
    result.catch(() => {})
  })

  test('searchIssues returns a Promise', () => {
    const result = searchIssues('token', 'repo', 'owner', 'query')
    expect(result instanceof Promise).toBe(true)
    result.catch(() => {})
  })

  test('createIssue returns a Promise', () => {
    const result = createIssue('token', 'repo', 'owner', 'title', 'body')
    expect(result instanceof Promise).toBe(true)
    result.catch(() => {})
  })

  test('updateIssue returns a Promise', () => {
    const result = updateIssue('token', 'repo', 'owner', 1, 'title', 'body')
    expect(result instanceof Promise).toBe(true)
    result.catch(() => {})
  })
})
