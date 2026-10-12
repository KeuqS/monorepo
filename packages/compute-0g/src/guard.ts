export class ComputeTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`compute call timed out after ${timeoutMs}ms`)
    this.name = "ComputeTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

export class ComputeCallLimitError extends Error {
  readonly jobId: string
  readonly maxCallsPerJob: number

  constructor(jobId: string, maxCallsPerJob: number) {
    super(`job ${jobId} exceeded the ${maxCallsPerJob}-call compute limit`)
    this.name = "ComputeCallLimitError"
    this.jobId = jobId
    this.maxCallsPerJob = maxCallsPerJob
  }
}

function assertTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError("timeoutMs must be a non-negative finite number")
  }
}

function assertCallLimit(maxCallsPerJob: number): void {
  if (!Number.isInteger(maxCallsPerJob) || maxCallsPerJob < 1) {
    throw new RangeError("maxCallsPerJob must be a positive integer")
  }
}

export function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number
): Promise<T> {
  assertTimeout(timeoutMs)

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ComputeTimeoutError(timeoutMs)),
      timeoutMs
    )
  })

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

export interface ComputeGuardOptions {
  maxCallsPerJob: number
  timeoutMs?: number
}

export class ComputeGuard {
  readonly maxCallsPerJob: number
  readonly timeoutMs: number | undefined
  private readonly calls = new Map<string, number>()

  constructor(options: ComputeGuardOptions) {
    assertCallLimit(options.maxCallsPerJob)
    if (options.timeoutMs !== undefined) assertTimeout(options.timeoutMs)

    this.maxCallsPerJob = options.maxCallsPerJob
    this.timeoutMs = options.timeoutMs
  }

  callCount(jobId: string): number {
    return this.calls.get(jobId) ?? 0
  }

  reset(jobId: string): void {
    this.calls.delete(jobId)
  }

  async run<T>(jobId: string, operation: () => PromiseLike<T>): Promise<T> {
    const nextCount = this.callCount(jobId) + 1
    if (nextCount > this.maxCallsPerJob) {
      throw new ComputeCallLimitError(jobId, this.maxCallsPerJob)
    }

    this.calls.set(jobId, nextCount)
    const result = operation()
    return this.timeoutMs === undefined
      ? result
      : withTimeout(result, this.timeoutMs)
  }
}
