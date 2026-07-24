import assert from "node:assert/strict";
import test from "node:test";
import { retrieveSquareOrderWithRetry } from "@/app/api/integrations/square/webhook/route";
import type { SquareOrder } from "@/app/api/integrations/square/_lib";

const readyOrder: SquareOrder = {
  id: "order_ready",
  line_items: [{ uid: "line_1", catalog_object_id: "variation_1", quantity: "1" }],
};

test("returns an order available immediately without waiting", async () => {
  const delays: number[] = [];
  const result = await retrieveSquareOrderWithRetry(
    async () => readyOrder,
    async (delay) => { delays.push(delay); },
  );

  assert.equal(result.order, readyOrder);
  assert.equal(result.attempts, 1);
  assert.deepEqual(delays, []);
});

test("returns an order that appears on a later bounded attempt", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await retrieveSquareOrderWithRetry(
    async () => (++calls === 2 ? readyOrder : null),
    async (delay) => { delays.push(delay); },
  );

  assert.equal(result.order, readyOrder);
  assert.equal(result.attempts, 2);
  assert.deepEqual(delays, [500]);
});

test("waits for line items that appear on a later attempt", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await retrieveSquareOrderWithRetry(
    async () => (++calls === 3 ? readyOrder : { id: "order_waiting", line_items: [] }),
    async (delay) => { delays.push(delay); },
  );

  assert.equal(result.order, readyOrder);
  assert.equal(result.attempts, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("stops after three attempts when the order remains unavailable", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await retrieveSquareOrderWithRetry(
    async () => { calls += 1; return null; },
    async (delay) => { delays.push(delay); },
  );

  assert.equal(result.order, null);
  assert.equal(result.attempts, 3);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("a later webhook retry can retrieve an order after an exhausted delivery", async () => {
  const firstDelivery = await retrieveSquareOrderWithRetry(async () => null, async () => {});
  const laterDelivery = await retrieveSquareOrderWithRetry(async () => readyOrder, async () => {});

  assert.equal(firstDelivery.order, null);
  assert.equal(laterDelivery.order, readyOrder);
});
