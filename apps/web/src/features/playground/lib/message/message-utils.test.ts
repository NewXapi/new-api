import { describe, expect, test } from 'bun:test'

import {
  createLoadingAssistantMessage,
  createMessageVersion,
  createUserMessage,
} from './message-utils'

describe('nanoid-backed message identifiers', () => {
  test('creates nonempty unique identifiers for messages and versions', () => {
    const version = createMessageVersion('hello')
    const userMessage = createUserMessage('hello', 0)
    const assistantMessage = createLoadingAssistantMessage(0)
    const identifiers = [
      version.id,
      userMessage.key,
      userMessage.versions[0].id,
      assistantMessage.key,
      assistantMessage.versions[0].id,
    ]

    expect(identifiers.every((identifier) => identifier.length > 0)).toBe(true)
    expect(new Set(identifiers).size).toBe(identifiers.length)
  })
})
