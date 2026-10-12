import { expect, jest, test } from "bun:test"
import {
  ComputeCallLimitError,
  ComputeGuard,
  ComputeTimeoutError,
  withTimeout,
} from "./guard"

test("resolves a promise before the timeout", async () => {
  await expect(withTimeout(Promise.resolve("done"), 50)).resolves.toBe("done")
})

test("rejects when a promise exceeds the timeout", async () => {
  jest.useFakeTimers()
  try {
    const pending = withTimeout(new Promise<never>(() => {}), 10)
    jest.advanceTimersByTime(10)
    await expect(pending).rejects.toBeInstanceOf(ComputeTimeoutError)
  } finally {
    jest.useRealTimers()
  }
})

test("preserves the original rejection", async () => {
  const error = new Error("upstream failed")
  await expect(withTimeout(Promise.reject(error), 50)).rejects.toBe(error)
})

test("counts calls independently for each job", async () => {
  const guard = new ComputeGuard({ maxCallsPerJob: 2 })

  await guard.run("job-a", async () => "first")
  await guard.run("job-a", async () => "second")
  await guard.run("job-b", async () => "first")

  expect(guard.callCount("job-a")).toBe(2)
  expect(guard.callCount("job-b")).toBe(1)
})

test("rejects calls beyond the per-job limit", async () => {
  const guard = new ComputeGuard({ maxCallsPerJob: 1 })

  await guard.run("job-a", async () => "first")
  await expect(guard.run("job-a", async () => "second")).rejects.toMatchObject({
    name: "ComputeCallLimitError",
    jobId: "job-a",
    maxCallsPerJob: 1,
  } satisfies Partial<ComputeCallLimitError>)
})

test("applies the timeout to guarded calls", async () => {
  jest.useFakeTimers()
  try {
    const guard = new ComputeGuard({ maxCallsPerJob: 1, timeoutMs: 10 })
    const pending = guard.run("job-a", () => new Promise<never>(() => {}))

    jest.advanceTimersByTime(10)
    await expect(pending).rejects.toBeInstanceOf(ComputeTimeoutError)
    expect(guard.callCount("job-a")).toBe(1)
  } finally {
    jest.useRealTimers()
  }
})
