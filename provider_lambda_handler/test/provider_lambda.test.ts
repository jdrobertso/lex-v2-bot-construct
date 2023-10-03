import { describe, expect, test } from '@jest/globals';
import { onEvent } from '../lib/index';
import https from 'https';

describe('index', () => {
  beforeAll(() => {
    https.request = jest.fn().mockImplementation(() => {
      return true;
    })
  });

  test('handles onCreate event', () => {
    const data = onEvent({
      RequestType: 'Create'
    }, {});
    expect(data).toBe('');
  });

  test('handles onUpdate event', () => {
    const data = onEvent({
      RequestType: 'Update'
    }, {});
    expect(data).toBe('');
  });

  test('handles onDelete event', () => {
    expect(onEvent({
      RequestType: 'Delete'
    }, {})).toBe('1');
  });

  test('throws an error when passed invalid input', () => {
    const t = () => {
      onEvent({
        RequestType: 'Invalid'
      }, {});
    };
    expect(t).toThrow('Invalid request type Invalid');
  });
});