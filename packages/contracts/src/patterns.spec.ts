import { describe, expect, it } from 'vitest';
import {
  ORDER_CREATED,
  ORDER_STOCK_REJECTED,
  ORDER_STOCK_RESERVED,
  ORDERS_CREATE,
  ORDERS_FIND_ALL,
  ORDERS_FIND_ONE,
  PRODUCTS_FIND_ALL,
  PRODUCTS_FIND_ONE,
  PRODUCTS_RESERVE,
} from './patterns.js';

/**
 * These strings are a wire protocol. A publisher and a consumer that disagree
 * by one character fail silently, so the exact values are pinned here — a
 * rename becomes a failing test instead of a message nobody receives.
 */
describe('messaging patterns', () => {
  it('pins the order command patterns', () => {
    expect(ORDERS_CREATE).toBe('orders.create');
    expect(ORDERS_FIND_ALL).toBe('orders.findAll');
    expect(ORDERS_FIND_ONE).toBe('orders.findOne');
  });

  it('pins the product command patterns', () => {
    expect(PRODUCTS_FIND_ALL).toBe('products.findAll');
    expect(PRODUCTS_FIND_ONE).toBe('products.findOne');
    expect(PRODUCTS_RESERVE).toBe('products.reserve');
  });

  it('pins the order event patterns', () => {
    expect(ORDER_CREATED).toBe('order.created');
    expect(ORDER_STOCK_RESERVED).toBe('order.stock-reserved');
    expect(ORDER_STOCK_REJECTED).toBe('order.stock-rejected');
  });

  it('keeps every pattern unique', () => {
    const all = [
      ORDERS_CREATE,
      ORDERS_FIND_ALL,
      ORDERS_FIND_ONE,
      PRODUCTS_FIND_ALL,
      PRODUCTS_FIND_ONE,
      PRODUCTS_RESERVE,
      ORDER_CREATED,
      ORDER_STOCK_RESERVED,
      ORDER_STOCK_REJECTED,
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});
