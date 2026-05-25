# Upgrade Guide: v0.1.0 → v0.2.0

This guide helps you upgrade your Deterministic Universal Stack installation from v0.1.0 to v0.2.0 with security hardening.

## Quick Start

```bash
# 1. Update dependencies
npm install

# 2. Run verification
npm run verify

# 3. Fix any type errors
npm run typecheck

# 4. Fix linting issues
npm run lint -- --fix

# 5. Format code
npm run format
```

## Key Changes Summary

| Category | Change | Impact |
|----------|--------|--------|
| Node.js | 20.0.0 → 20.11.0 | Requires update, better security |
| Validation | New input validation | Breaking: stricter error handling |
| Limits | Event count limits | Breaking: throws at 100K events |
| Linting | ESLint added | Non-breaking: code quality |
| Formatting | Prettier added | Non-breaking: code style |

## Breaking Changes

### 1. DUS Constructor Validation

**Before v0.2.0**
```typescript
// This would silently fail or cause issues later
const dus = new DUS(nodeId: any, reducer, {} as any);
```

**After v0.2.0** (BREAKING)
```typescript
// Constructor now validates all parameters
const dus = new DUS("node-1", reducer, {
  reducerVersion: "1.0.0",
  initialValue: {}
});
// Throws: "Invalid nodeId" if nodeId is empty/not string
// Throws: "Invalid reducerVersion" if missing
```

**Migration**
- Ensure nodeId is always a non-empty string
- Ensure options object includes reducerVersion
- Ensure initialValue matches your value type

### 2. Event Emission Validation

**Before v0.2.0**
```typescript
// Empty type accepted
const event = dus.emit("", payload);
```

**After v0.2.0** (BREAKING)
```typescript
// Event type must be non-empty string
const event = dus.emit("action", payload);
// Throws: "Invalid event type" if empty
```

**Migration**
- Ensure all event types are meaningful non-empty strings
- Check all emit() calls specify valid types

### 3. Event Acceptance Validation

**Before v0.2.0**
```typescript
// Malformed events could be added
dus.accept({ id: undefined, ...rest });
```

**After v0.2.0** (BREAKING)
```typescript
// Event must have valid id
dus.accept(event);
// Throws: "Invalid event id" if missing or invalid
```

**Migration**
- Events must be created via emit() or properly validated
- Avoid manually constructing event objects
- Use sync() for peer events

### 4. Event Limit

**Before v0.2.0**
```typescript
// Could accept unlimited events
for (let i = 0; i < 1000000; i++) {
  dus.emit("event", { i });
}
```

**After v0.2.0** (BREAKING)
```typescript
// Default limit: 100,000 events
// Throws after limit exceeded
for (let i = 0; i < 1000000; i++) {
  dus.emit("event", { i }); // Throws at 100K
}

// Solution: Increase limit if needed (see Advanced section)
```

**Migration**
- Monitor event count in production
- Implement event archival/cleanup
- Use snapshots to reset event history if needed
- See "Configuring Limits" section below

### 5. Topological Sort Depth Limit

**Before v0.2.0**
```typescript
// Very deep event chains could cause issues
const deepChain = createDeepEventChain(50000);
const sorted = topologicalSort(deepChain); // Might fail
```

**After v0.2.0** (BREAKING)
```typescript
// Default limit: 10,000 events
const deepChain = createDeepEventChain(50000);
const sorted = topologicalSort(deepChain);
// Throws: "Topological sort exceeded max depth limit"

// Solution: Use multiple shorter chains or reduce depth
```

**Migration**
- Analyze event dependencies
- Avoid creating excessively deep chains
- Consider event merging strategies
- Use snapshots to reset event history

## Non-Breaking Changes

These don't affect existing code but improve quality:

### ESLint Integration
```bash
npm run lint
```
- Finds potential bugs
- Enforces TypeScript best practices
- All fixes non-breaking

### Prettier Formatting
```bash
npm run format
```
- Auto-fixes code style
- No functional changes
- Run as part of CI/CD

## Step-by-Step Migration

### Step 1: Backup Current Code
```bash
git commit -m "Pre-upgrade backup"
git tag v0.1.0-backup
```

### Step 2: Update Dependencies
```bash
# Update Node.js (if needed)
# Use nvm or update system Node.js to 20.11.0+

# Update npm packages
npm install
```

### Step 3: Fix Type Errors
```bash
npm run typecheck
```

Look for:
- Missing nodeId validation
- Missing options object
- Missing reducerVersion
- Improper event type specification

**Example Fix**
```typescript
// BEFORE
const dus = new DUS(nodeId, reducer, {});

// AFTER
const dus = new DUS(
  nodeId || "default-node",
  reducer,
  {
    reducerVersion: "1.0.0",
    initialValue: {}
  }
);
```

### Step 4: Fix Linting Issues
```bash
npm run lint -- --fix
```

Auto-fixes most issues:
- Missing explicit return types
- Unused variables
- Type safety issues

Manual fixes needed:
- Complex type assertions
- Async/promise issues
- Security concerns

### Step 5: Run Tests
```bash
npm run test
```

Fix any test failures:
- Constructor validation tests
- Event validation tests
- Limit boundary tests

### Step 6: Format Code
```bash
npm run format
```

### Step 7: Security Audit
```bash
npm audit
```

Fix any vulnerabilities:
```bash
npm audit fix
```

### Step 8: Verify Everything
```bash
npm run verify
```

Should pass:
- ✅ Type checking
- ✅ Linting
- ✅ All tests
- ✅ No security issues

## Common Issues & Solutions

### Issue: "Invalid nodeId"

**Cause**: nodeId is empty, null, or not a string

**Solution**
```typescript
// ❌ Wrong
const dus = new DUS("", reducer, options);

// ✅ Correct
const dus = new DUS("unique-node-id", reducer, options);
```

### Issue: "Invalid reducerVersion"

**Cause**: reducerVersion missing from options

**Solution**
```typescript
// ❌ Wrong
const dus = new DUS(nodeId, reducer, {});

// ✅ Correct
const dus = new DUS(nodeId, reducer, {
  reducerVersion: "1.0.0"
});
```

### Issue: "Event limit exceeded"

**Cause**: More than 100,000 events

**Solution**
```typescript
// Option 1: Clean up old events
const snapshot = dus.snapshot();
const tailEvents = dus.getEvents().slice(-1000);
const newDus = new DUS(nodeId, reducer, options);
newDus.replayFromSnapshot(snapshot, tailEvents);

// Option 2: Increase limit (if needed)
class CustomDUS extends DUS {
  constructor(nodeId, reducer, options) {
    super(nodeId, reducer, options);
    this.maxEvents = 1000000; // Increase limit
  }
}
```

### Issue: "Input structure too deeply nested"

**Cause**: Payload exceeds 32 levels of nesting

**Solution**
```typescript
// Flatten deeply nested structures
const payload = { deeply: { nested: { structure: { ... } } } };

// Instead, flatten:
const payload = {
  path: "deeply.nested.structure",
  value: { ... }
};
```

### Issue: "Cycle detected while sorting events"

**Cause**: Event graph has circular dependencies

**Solution**
```typescript
// Fix event dependencies
dus.verify(); // Check for cycles

// Or skip events with cycles
try {
  dus.accept(eventWithDependencyIssue);
} catch (e) {
  console.error("Cannot accept event:", e.message);
}
```

## Advanced Configuration

### Increasing Event Limit

For applications needing more events:

```typescript
const dus = new DUS(nodeId, reducer, options);
// Default: 100,000
// Change if needed (class extension approach recommended)
```

### Increasing Recursion Depth

For complex nested payloads:

```typescript
// In your reducer validation code
function validateInput(value, depth = 0, maxDepth = 64) {
  // Custom depth limit
}
```

### Increasing Sort Depth

For large event sets:

```typescript
// When processing many events
const sorted = topologicalSort(events, 50000); // Custom limit
```

## Testing Your Migration

### Test Template

```typescript
import { describe, it, expect } from "vitest";
import { DUS } from "@dus/core";

describe("DUS v0.2.0 Compatibility", () => {
  it("should validate nodeId", () => {
    expect(() => new DUS("", reducer, { 
      reducerVersion: "1.0.0" 
    })).toThrow("Invalid nodeId");
  });

  it("should require reducerVersion", () => {
    expect(() => new DUS("node-1", reducer, {}))
      .toThrow("Invalid reducerVersion");
  });

  it("should enforce event limit", () => {
    const dus = new DUS("node-1", reducer, {
      reducerVersion: "1.0.0"
    });
    
    for (let i = 0; i < 100001; i++) {
      if (i === 100000) {
        expect(() => dus.emit("event", {}))
          .toThrow("Event limit exceeded");
      } else {
        dus.emit("event", {});
      }
    }
  });
});
```

## Getting Help

### Resources

1. **SECURITY_HARDENING.md** - Security details
2. **CHANGELOG.md** - Complete change log
3. **docs/** - Comprehensive documentation
4. **tests/** - Example test patterns

### Support Channels

- GitHub Issues: [Report bugs or ask questions]
- Discussions: [Join community discussions]
- Email: [Support contact]

## Version Verification

After upgrade, verify your version:

```bash
# Check package.json
cat package.json | grep '"version"'
# Should show: "version": "0.2.0"

# Check Node.js version
node --version
# Should show: v20.11.0 or higher
```

## Rollback Instructions

If you need to revert:

```bash
# Restore from git
git checkout v0.1.0-backup

# Reinstall old dependencies
npm install
```

## What's Next?

After upgrading to v0.2.0:

1. **Review Documentation**: Check SECURITY_HARDENING.md for new best practices
2. **Run Audits**: Regular `npm audit` to stay secure
3. **Test Thoroughly**: Ensure your application works with stricter validation
4. **Monitor Limits**: Watch event counts and adjust if needed
5. **Keep Updated**: Watch for v0.2.1+ patches

---

**Questions?** Check the [FAQ](docs/FAQ.md) or open an issue.

**Upgrade Date**: May 2026  
**Target Version**: 0.2.0  
**Estimated Migration Time**: 1-4 hours depending on codebase size
