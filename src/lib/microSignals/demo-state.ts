/** Ephemeral, browser-local synthetic event stream; never interacts with real data. */
import manifest from '../../../fixtures/clinical/microsignals-cohort-50.json';
import { applySyntheticLabEvent } from './engine.ts';
import { syntheticStreamEvents, type SyntheticPatient } from './synthetic.ts';

const demoPatients = manifest as unknown as SyntheticPatient[];
const demoEvents = syntheticStreamEvents();
export const STREAM_SIZE = demoEvents.length;

export type DemoState = {
  patients: SyntheticPatient[];
  cursor: number;
  history: { id: string; at: string; label: string }[];
};
export type DemoAction = { type: 'tick' } | { type: 'reset' };

export function makeDemoState(): DemoState {
  return { patients: demoPatients, cursor: 0, history: [] };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'reset') return makeDemoState();
  if (state.cursor >= demoEvents.length) return state;
  const event = demoEvents[state.cursor];
  return {
    patients: applySyntheticLabEvent(state.patients, event),
    cursor: state.cursor + 1,
    history: [{ id: event.observation.id, at: event.observation.observedAt,
      label: `${event.patientId} · ${event.observation.label} : ${event.observation.value} ${event.observation.unit}` }, ...state.history],
  };
}
