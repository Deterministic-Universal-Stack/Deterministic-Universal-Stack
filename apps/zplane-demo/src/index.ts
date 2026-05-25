/**
 * Z Plane Demo App
 *
 * Demonstrates multi-language deterministic computation workflow:
 * 1. TypeScript: Validate and transform input
 * 2. Hypothetical Python: Apply ML model (stubbed)
 * 3. Hypothetical Go: Compress results (stubbed)
 * 4. TypeScript: Format output
 *
 * All steps participate in DUS event system with cross-language
 * determinism guarantees.
 */

import {
  RuntimeLanguage,
  SerializationFormat,
  ZPlaneEvent,
  ExecutionPlan,
  type ExecutionContext,
} from "@dus/zplane";
import { typeScriptAdapter } from "@dus/zplane/adapters";
import { createZPlaneCoordinator } from "@dus/zplane/runtime";

// Initialize adapters
async function initializeAdapters() {
  const coordinator = createZPlaneCoordinator({
    maxConcurrentExecutions: 8,
    operationTimeout: 30000,
  });

  // Register TypeScript adapter
  await coordinator.registerAdapter(typeScriptAdapter);

  // Register operations
  await typeScriptAdapter.registerOperation(
    "validate-input",
    async (input: Uint8Array, _format: SerializationFormat, context: ExecutionContext) => {
      console.log(`[TypeScript] Validating input in event ${context.eventId}`);

      const data = JSON.parse(new TextDecoder().decode(input));

      if (!data.records || !Array.isArray(data.records)) {
        throw new Error("Invalid input: records must be an array");
      }

      if (data.records.length === 0) {
        throw new Error("Invalid input: records cannot be empty");
      }

      // Return validated data
      return new TextEncoder().encode(
        JSON.stringify({
          validated: true,
          recordCount: data.records.length,
          timestamp: Date.now(),
        })
      );
    },
    {
      name: "validate-input",
      language: RuntimeLanguage.TYPESCRIPT,
      hash: "sha256:validate-v1",
      deterministic: true,
      pure: true,
      version: "1.0.0",
      registeredAt: Date.now(),
    }
  );

  await typeScriptAdapter.registerOperation(
    "format-output",
    async (input: Uint8Array, _format: SerializationFormat, context: ExecutionContext) => {
      console.log(`[TypeScript] Formatting output in event ${context.eventId}`);

      const data = JSON.parse(new TextDecoder().decode(input));

      const output = {
        status: "success",
        data,
        generatedAt: new Date().toISOString(),
        causationChain: context.causationChain,
      };

      return new TextEncoder().encode(JSON.stringify(output, null, 2));
    },
    {
      name: "format-output",
      language: RuntimeLanguage.TYPESCRIPT,
      hash: "sha256:format-v1",
      deterministic: true,
      pure: true,
      version: "1.0.0",
      registeredAt: Date.now(),
    }
  );

  return coordinator;
}

// Execute a multi-language workflow
async function executeWorkflow(coordinator: any) {
  // Input data: batch of records to process
  const inputData = {
    records: [
      { id: 1, value: "alice", score: 95 },
      { id: 2, value: "bob", score: 87 },
      { id: 3, value: "charlie", score: 92 },
    ],
  };

  const inputBytes = new TextEncoder().encode(JSON.stringify(inputData));

  // Define execution plan
  const plan: ExecutionPlan = {
    id: `workflow-${Date.now()}`,
    steps: [
      {
        id: "step-validate",
        operationName: "validate-input",
        language: RuntimeLanguage.TYPESCRIPT,
        input: inputBytes,
        inputFormat: SerializationFormat.JSON,
        outputFormat: SerializationFormat.JSON,
        dependencies: [],
      },
      // In a real system, these would invoke Python and Go:
      // {
      //   id: "step-predict",
      //   operationName: "apply-model",
      //   language: RuntimeLanguage.PYTHON,
      //   input: new Uint8Array(), // Would use step-validate output
      //   inputFormat: SerializationFormat.CBOR,
      //   outputFormat: SerializationFormat.CBOR,
      //   dependencies: ["step-validate"],
      // },
      // {
      //   id: "step-compress",
      //   operationName: "compress-batch",
      //   language: RuntimeLanguage.GO,
      //   input: new Uint8Array(), // Would use step-predict output
      //   inputFormat: SerializationFormat.CBOR,
      //   outputFormat: SerializationFormat.CBOR,
      //   dependencies: ["step-predict"],
      // },
      {
        id: "step-format",
        operationName: "format-output",
        language: RuntimeLanguage.TYPESCRIPT,
        input: new Uint8Array(), // Would use previous step output
        inputFormat: SerializationFormat.JSON,
        outputFormat: SerializationFormat.JSON,
        dependencies: ["step-validate"],
      },
    ],
    timeout: 30000,
  };

  console.log("\n=== Executing Multi-Language Workflow ===\n");
  console.log(`Workflow ID: ${plan.id}`);
  console.log(`Steps: ${plan.steps.length}`);
  console.log(`Timeout: ${plan.timeout}ms\n`);

  // Execute
  const result = await coordinator.executeMultiLanguage(plan);

  console.log("\n=== Workflow Results ===\n");
  console.log(`Success: ${result.success}`);
  console.log(`Total Time: ${result.totalTimeMs}ms`);
  console.log(`Errors: ${result.errors.length}`);

  if (result.stepResults.size > 0) {
    console.log("\nStep Results:");
    for (const [stepId, stepResult] of result.stepResults) {
      console.log(`  ${stepId}:`);
      console.log(`    Success: ${stepResult.success}`);
      console.log(`    Output Format: ${stepResult.outputFormat}`);
      console.log(
        `    Execution Time: ${stepResult.metrics.executionTimeMs}ms`
      );

      if (stepResult.output) {
        try {
          const output = JSON.parse(new TextDecoder().decode(stepResult.output));
          console.log(`    Output: ${JSON.stringify(output, null, 6)}`);
        } catch {
          console.log(`    Output: [binary data]`);
        }
      }

      if (stepResult.error) {
        console.log(`    Error: ${stepResult.error.message}`);
      }
    }
  }

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const error of result.errors) {
      console.log(`  ${error.stepId}: ${error.error}`);
    }
  }

  return result;
}

// Verify determinism
async function verifyDeterminism(coordinator: any) {
  console.log("\n=== Determinism Verification ===\n");

  const events: ZPlaneEvent[] = [
    {
      id: "evt-1",
      timestamp: Date.now(),
      sourceLanguage: RuntimeLanguage.TYPESCRIPT,
      parents: [],
      operationName: "validate-input",
      operationLanguage: RuntimeLanguage.TYPESCRIPT,
      operationHash: "sha256:validate-v1",
      input: {
        format: SerializationFormat.JSON,
        data: new TextEncoder().encode('{"records": []}'),
      },
    },
  ];

  const report = await coordinator.verifyConsistency(events);

  console.log(`Event Set Hash: ${report.eventSetHash}`);
  console.log(`Adapter Count: ${report.adapterCount}`);
  console.log(`Consistent: ${report.consistent}`);

  if (report.stateHashes.size > 0) {
    console.log("\nState Hashes by Language:");
    for (const [language, hash] of report.stateHashes) {
      console.log(`  ${language}: ${hash}`);
    }
  }

  if (report.discrepancies.length > 0) {
    console.log("\nDiscrepancies:");
    for (const disc of report.discrepancies) {
      console.log(
        `  ${disc.language1} vs ${disc.language2} at event ${disc.divergencePoint}`
      );
    }
  }
}

// Monitor adapter health
async function monitorHealth(coordinator: any) {
  console.log("\n=== Adapter Health Status ===\n");

  const adapters = await coordinator.listAdapters();

  for (const adapter of adapters) {
    const health = await adapter.health();

    console.log(`${adapter.language}:`);
    console.log(`  Healthy: ${health.healthy}`);
    console.log(`  Uptime: ${health.uptime}ms`);
    console.log(`  Total Operations: ${health.metrics.totalOperations}`);
    console.log(`  Failed Operations: ${health.metrics.failedOperations}`);
    console.log(
      `  Avg Execution Time: ${health.metrics.averageExecutionTimeMs.toFixed(2)}ms`
    );
  }
}

// Main
async function main() {
  try {
    console.log("🚀 Z Plane Demo: Multi-Language Deterministic Computation\n");
    console.log(
      "This demo shows how different languages participate in DUS determinism.\n"
    );

    const coordinator = await initializeAdapters();
    console.log("✅ Adapters initialized\n");

    await executeWorkflow(coordinator);
    await verifyDeterminism(coordinator);
    await monitorHealth(coordinator);

    console.log("\n✅ Demo complete\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
