import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResponseFor, WorkerRequest, WorkerRequestInput, WorkerResponse } from '../workers/protocol'

/**
 * Thin request/response wrapper over the redaction worker.
 *
 * Every request carries an id so concurrent calls cannot cross wires, and
 * progress messages are surfaced separately from the eventual result.
 */

type Pending = {
  resolve: (value: WorkerResponse) => void
  reject: (reason: Error) => void
}

export interface Progress {
  phase: string
  pct: number
}

export function useRedactionWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pending = useRef(new Map<number, Pending>())
  const nextId = useRef(1)
  const [progress, setProgress] = useState<Progress | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('../workers/redaction.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        setProgress({ phase: msg.phase, pct: msg.pct })
        return
      }
      const entry = pending.current.get(msg.id)
      if (!entry) return
      pending.current.delete(msg.id)
      if (msg.type === 'error') entry.reject(new Error(msg.message))
      else entry.resolve(msg)
    }

    worker.onerror = (event) => {
      const error = new Error(event.message || 'The redaction worker failed')
      for (const entry of pending.current.values()) entry.reject(error)
      pending.current.clear()
    }

    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
      // Rejecting on unmount stops a caller awaiting forever after navigation.
      for (const entry of pending.current.values()) entry.reject(new Error('Cancelled'))
      pending.current.clear()
    }
  }, [])

  const send = useCallback(<R extends WorkerRequestInput>(
    req: R,
  ): Promise<ResponseFor<R['type']>> => {
    const worker = workerRef.current
    if (!worker) return Promise.reject(new Error('Worker is not ready'))
    const id = nextId.current++
    return new Promise<WorkerResponse>((resolve, reject) => {
      pending.current.set(id, { resolve, reject })
      worker.postMessage({ ...req, id } as WorkerRequest)
    }) as Promise<ResponseFor<R['type']>>
  }, [])

  return { send, progress, setProgress }
}
