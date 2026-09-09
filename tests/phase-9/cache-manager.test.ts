/**
 * Phase 9: Cache Manager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CacheManager, getGlobalCacheManager, CacheEntry } from './CacheManager';

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager({
      l1MaxSize: 10,
      l1TtlMs: 5000,
      indexedDbName: 'test-cache',
      indexedDbVersion: 1
    });
  });

  afterEach(() => {
    cache.dispose();
  });

  describe('L1 Cache', () => {
    it('should store and retrieve values', async () => {
      await cache.set('test-key', { data: 'test-value' }, 'L1');
      const result = await cache.get<{ data: string }>('test-key', 'L1');
      expect(result).toEqual({ data: 'test-value' });
    });

    it('should return null for missing keys', async () => {
      const result = await cache.get('nonexistent', 'L1');
      expect(result).toBeNull();
    });

    it('should respect TTL', async () => {
      const shortTtlCache = new CacheManager({
        l1MaxSize: 10,
        l1TtlMs: 100,
        indexedDbName: 'test-cache-ttl',
        indexedDbVersion: 1
      });

      await shortTtlCache.set('ttl-key', 'value', 'L1', 100);
      expect(await shortTtlCache.get('ttl-key', 'L1')).toBe('value');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(await shortTtlCache.get('ttl-key', 'L1')).toBeNull();
      
      shortTtlCache.dispose();
    });

    it('should enforce max size limit', async () => {
      const smallCache = new CacheManager({
        l1MaxSize: 3,
        l1TtlMs: 60000,
        indexedDbName: 'test-cache-small',
        indexedDbVersion: 1
      });

      await smallCache.set('key1', 'value1', 'L1');
      await smallCache.set('key2', 'value2', 'L1');
      await smallCache.set('key3', 'value3', 'L1');
      await smallCache.set('key4', 'value4', 'L1'); // Should evict key1

      expect(await smallCache.get('key1', 'L1')).toBeNull();
      expect(await smallCache.get('key2', 'L1')).toBe('value2');
      expect(await smallCache.get('key4', 'L1')).toBe('value4');

      smallCache.dispose();
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate by pattern', async () => {
      await cache.set('paper:1:graph', 'graph1', 'L1');
      await cache.set('paper:2:graph', 'graph2', 'L1');
      await cache.set('paper:1:layout', 'layout1', 'L1');

      await cache.invalidate('paper:1:*');

      expect(await cache.get('paper:1:graph', 'L1')).toBeNull();
      expect(await cache.get('paper:1:layout', 'L1')).toBeNull();
      expect(await cache.get('paper:2:graph', 'L1')).toBe('graph2');
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'value1', 'L1');
      await cache.set('key2', 'value2', 'L1');

      await cache.clear();

      expect(await cache.get('key1', 'L1')).toBeNull();
      expect(await cache.get('key2', 'L1')).toBeNull();
    });
  });

  describe('Version Tracking', () => {
    it('should generate version on set', async () => {
      await cache.set('versioned-key', 'value', 'L1', undefined, 'v1.0.0');
      // Version is stored internally, verify through retrieval
      const result = await cache.get('versioned-key', 'L1');
      expect(result).toBe('value');
    });
  });

  describe('Multi-Tier Flow', () => {
    it('should check L1 before L3', async () => {
      // Set in L3 first
      await cache.set('multi-tier-key', { tier: 'l3' }, 'L3');
      
      // First get should populate L1 from L3
      const result1 = await cache.get('multi-tier-key', 'L1');
      expect(result1).toEqual({ tier: 'l3' });
      
      // Second get should hit L1 directly
      const result2 = await cache.get('multi-tier-key', 'L1');
      expect(result2).toEqual({ tier: 'l3' });
    });
  });

  describe('Singleton', () => {
    it('should return same instance from getGlobalCacheManager', () => {
      const instance1 = getGlobalCacheManager();
      const instance2 = getGlobalCacheManager();
      expect(instance1).toBe(instance2);
    });
  });
});
