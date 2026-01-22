import * as https from 'https'

// Type for the request function to allow dependency injection
export type HttpsRequestFn = typeof https.request

// Default implementation using the real https module
let requestImpl: HttpsRequestFn = https.request

/**
 * Set a custom request implementation (for testing)
 * @internal
 */
export function _setRequestImpl(impl: HttpsRequestFn): void {
  requestImpl = impl
}

/**
 * Reset to the default request implementation
 * @internal
 */
export function _resetRequestImpl(): void {
  requestImpl = https.request
}

/**
 * Make an HTTPS request to the GitHub API
 */
export async function httpsRequest(
  options: https.RequestOptions,
  data?: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = requestImpl(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`))
        }
      })
    })
    req.on('error', reject)
    if (data) {
      req.write(data)
    }
    req.end()
  })
}

/**
 * Get existing comments on an issue or pull request
 */
export async function getExistingComments(
  token: string,
  repo: string,
  owner: string,
  issueNumber: number
): Promise<Array<{ id: number; body: string }>> {
  const options: https.RequestOptions = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json'
    }
  }

  const response = await httpsRequest(options)
  return JSON.parse(response)
}

/**
 * Delete a comment from an issue or pull request
 */
export async function deleteComment(
  token: string,
  repo: string,
  owner: string,
  commentId: number
): Promise<void> {
  const options: https.RequestOptions = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json'
    }
  }

  await httpsRequest(options)
}

/**
 * Post a comment to an issue or pull request
 */
export async function postComment(
  token: string,
  repo: string,
  owner: string,
  issueNumber: number,
  body: string
): Promise<void> {
  const options: https.RequestOptions = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    }
  }

  const payload = JSON.stringify({ body })
  await httpsRequest(options, payload)
}

/**
 * Search for issues in a repository
 */
export async function searchIssues(
  token: string,
  repo: string,
  owner: string,
  query: string
): Promise<Array<{ number: number; title: string; body: string }>> {
  const encodedQuery = encodeURIComponent(query)
  const options: https.RequestOptions = {
    hostname: 'api.github.com',
    path: `/search/issues?q=${encodedQuery}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json'
    }
  }

  const response = await httpsRequest(options)
  try {
    const result = JSON.parse(response)
    return result.items || []
  } catch (error) {
    throw new Error(
      `Failed to parse search issues response: ${(error as Error).message}`
    )
  }
}

/**
 * Create a new issue
 */
export async function createIssue(
  token: string,
  repo: string,
  owner: string,
  title: string,
  body: string
): Promise<number> {
  const options: https.RequestOptions = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/issues`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    }
  }

  const payload = JSON.stringify({ title, body })
  const response = await httpsRequest(options, payload)
  try {
    const issue = JSON.parse(response)
    if (!issue.number) {
      throw new Error('API response missing issue number')
    }
    return issue.number
  } catch (error) {
    throw new Error(
      `Failed to parse create issue response: ${(error as Error).message}`
    )
  }
}

/**
 * Update an existing issue
 */
export async function updateIssue(
  token: string,
  repo: string,
  owner: string,
  issueNumber: number,
  title: string,
  body: string
): Promise<void> {
  const options: https.RequestOptions = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/issues/${issueNumber}`,
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'tf-report-action',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    }
  }

  const payload = JSON.stringify({ title, body })
  await httpsRequest(options, payload)
}
