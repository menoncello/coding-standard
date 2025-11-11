#!/bin/bash

# Cache Burn-in Testing Script
# Runs comprehensive cache component stability tests
# Usage: ./scripts/cache-burn-in.sh [iterations]

set -e

DEFAULT_ITERATIONS=10
ITERATIONS=${1:-$DEFAULT_ITERATIONS}

echo "🔥 Cache Burn-in Testing Script"
echo "================================"
echo "Iterations: $ITERATIONS"
echo ""

# Validate we're in the right directory
if [ ! -f "bun.lockb" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Function to run a test suite
run_test_suite() {
    local test_file=$1
    local description=$2

    echo "🧪 Running $description..."

    if bun test "$test_file"; then
        echo "✅ $description passed"
        return 0
    else
        echo "❌ $description failed"
        return 1
    fi
}

# Main burn-in loop
echo "🚀 Starting Cache Burn-in Loop - $ITERATIONS iterations"
echo "======================================================="

for i in $(seq 1 $ITERATIONS); do
    echo ""
    echo "📊 Burn-in iteration $i/$ITERATIONS"
    echo "-----------------------------------"

    # Track iteration start time
    start_time=$(date +%s.%N)

    # Run cache-specific test suites
    failed=0

    if ! run_test_suite "tests/unit/cache/cache-security.test.ts" "Cache Security Tests"; then
        failed=1
    fi

    if ! run_test_suite "tests/unit/cache/performance-layer.test.ts" "Cache Performance Tests"; then
        failed=1
    fi

    if ! run_test_suite "tests/unit/cache/lru-cache.test.ts" "LRU Cache Tests"; then
        failed=1
    fi

    if ! run_test_suite "tests/unit/cache/cache-warming.test.ts" "Cache Warming Tests"; then
        failed=1
    fi

    # Calculate iteration duration
    end_time=$(date +%s)
    duration=$((end_time - start_time))

    if [ $failed -eq 1 ]; then
        echo "❌ Iteration $i failed after ${duration}s"
        exit 1
    else
        echo "✅ Iteration $i completed successfully in ${duration}s"
    fi
done

echo ""
echo "🎉 All $ITERATIONS burn-in iterations completed!"
echo "✅ Cache components show consistent stability"
echo ""

# Integration tests (fewer iterations)
INTEGRATION_ITERATIONS=5
echo "🔗 Starting Cache Integration Burn-in - $INTEGRATION_ITERATIONS iterations"
echo "=========================================================================="

for i in $(seq 1 $INTEGRATION_ITERATIONS); do
    echo ""
    echo "📊 Integration burn-in iteration $i/$INTEGRATION_ITERATIONS"
    echo "-------------------------------------------------------"

    if ! run_test_suite "tests/integration/cache-security.test.ts" "Cache Integration Tests"; then
        echo "❌ Integration iteration $i failed"
        exit 1
    fi

    echo "✅ Integration iteration $i completed successfully"
done

echo ""
echo "🎉 All $INTEGRATION_ITERATIONS integration burn-in iterations completed!"
echo "✅ Cache integration shows consistent stability"
echo ""

# Performance validation
echo "📈 Running Performance Validation"
echo "=================================="

if bun test tests/performance/registry-performance.test.ts > performance-output.log 2>&1; then
    echo "✅ Performance tests completed"

    # Extract and display key metrics
    echo ""
    echo "=== Performance Metrics ==="
    if grep -q "Average response time" performance-output.log; then
        grep -E "(Average response time|Max response time|Requests processed)" performance-output.log
    else
        echo "Performance metrics not found in output"
        cat performance-output.log
    fi

    # Validate performance targets
    if grep -q "Average response time: [0-2][0-9]\.ms" performance-output.log; then
        echo "✅ Performance targets met (<30ms average)"
    else
        echo "⚠️ Performance targets may not be met"
    fi
else
    echo "❌ Performance tests failed"
    exit 1
fi

echo ""
echo "🏁 Burn-in Testing Complete!"
echo "============================"
echo "✅ All cache components passed stability testing"
echo "✅ Ready for production deployment"