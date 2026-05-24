export {
  CommunicationRuntime,
  communicationReducer,
  createInitialCommunicationState,
  decodeHandshakeBundle,
  encodeHandshakeBundle,
  type ChatEnvelope,
  type CommunicationState,
  type PeerProfile,
  type SignalingEnvelope
} from "@dus/comms";

export {
  DUS,
  canonicalHash,
  canonicalStringify,
  createState,
  stringifyWithBigInt,
  type DUSOptions,
  type EmitOptions,
  type Event,
  type Reducer,
  type Snapshot,
  type State
} from "@dus/core";

export {
  EventLog,
  type EventLogSnapshot,
  type LogSegment
} from "@dus/eventlog";

export {
  replayEvents,
  replayFromCheckpoint,
  type ReplayCheckpoint,
  type ReplayTrace
} from "@dus/replay";

export {
  FileSystemEventStore,
  merkleRoot,
  type PersistedLog,
  type StoreConfig
} from "@dus/storage";

export {
  DeterministicAgentRuntime,
  DeterministicProgramRuntime,
  agentReducer,
  programReducer,
  type AgentStep,
  type AgentTimeline,
  type ProgramFrame,
  type ProgramInstruction,
  type ProgramTimeline
} from "@dus/runtime";

export {
  ByzantineQuorum,
  convergeReplicas,
  divergence,
  gossipPair,
  missingEvents,
  toReplicaView,
  type GossipMetrics,
  type QuorumConfig,
  type ReplicaView,
  type Vote
} from "@dus/network";
