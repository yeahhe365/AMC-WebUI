import { describe, expect, it } from 'vitest';
import { getErrorMessage, toError } from './errorMessage';

describe('errorMessage utility', () => {
  describe('getErrorMessage', () => {
    it('returns error.message for Error instances', () => {
      expect(getErrorMessage(new Error('something went wrong'))).toBe('something went wrong');
    });

    it('returns fallback message if Error message is empty', () => {
      expect(getErrorMessage(new Error(''), 'fallback')).toBe('fallback');
    });

    it('returns string representation for strings and other values', () => {
      expect(getErrorMessage('raw string error')).toBe('raw string error');
      expect(getErrorMessage(404)).toBe('404');
    });

    it('returns fallback for null or undefined', () => {
      expect(getErrorMessage(null, 'default error')).toBe('default error');
      expect(getErrorMessage(undefined, 'default error')).toBe('default error');
      expect(getErrorMessage(null)).toBe('');
    });
  });

  describe('toError', () => {
    it('returns the same Error if already an Error instance', () => {
      const err = new Error('test');
      expect(toError(err)).toBe(err);
    });

    it('wraps string into Error', () => {
      const err = toError('network failure');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('network failure');
    });

    it('uses fallback message when value is empty or null', () => {
      const err = toError(null, 'custom fallback');
      expect(err.message).toBe('custom fallback');
    });

    it('defaults to Unknown error when no fallback provided', () => {
      const err = toError(undefined);
      expect(err.message).toBe('Unknown error');
    });
  });
});
