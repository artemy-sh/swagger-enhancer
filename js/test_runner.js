/**
 * Advanced Test Runner for Swagger Enhancer
 * Professional testing framework with better organization and reporting
 */

(() => {
  'use strict';

  class TestRunner {
    constructor() {
      this.tests = new Map();
      this.results = {
        passed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        duration: 0,
        errors: []
      };
      this.startTime = null;
      this.currentSuite = null;
    }

    /**
     * Register a test suite
     */
    suite(name, tests) {
      this.tests.set(name, tests);
    }

    /**
     * Run all test suites
     */
    async runAll() {
      console.log('🧪 Swagger Enhancer Test Runner');
      console.log('================================');
      
      this.startTime = performance.now();
      this.results = { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0, errors: [] };

      for (const [suiteName, suiteTests] of this.tests) {
        await this.runSuite(suiteName, suiteTests);
      }

      this.finish();
    }

    /**
     * Run a specific test suite
     */
    async runSuite(name, tests) {
      console.log(`\n📋 Running suite: ${name}`);
      console.log('─'.repeat(50));
      
      this.currentSuite = name;
      
      for (const [testName, testFn] of Object.entries(tests)) {
        await this.runTest(testName, testFn);
      }
    }

    /**
     * Run a single test
     */
    async runTest(name, testFn) {
      this.results.total++;
      
      try {
        const testStart = performance.now();
        await testFn();
        const testDuration = performance.now() - testStart;
        
        console.log(`✅ ${name} (${testDuration.toFixed(2)}ms)`);
        this.results.passed++;
      } catch (error) {
        console.error(`❌ ${name}: ${error.message}`);
        this.results.failed++;
        this.results.errors.push({
          suite: this.currentSuite,
          test: name,
          error: error.message,
          stack: error.stack
        });
      }
    }

    /**
     * Finish testing and show results
     */
    finish() {
      const totalDuration = performance.now() - this.startTime;
      this.results.duration = totalDuration;

      console.log('\n📊 Test Results Summary');
      console.log('========================');
      console.log(`Total: ${this.results.total}`);
      console.log(`✅ Passed: ${this.results.passed}`);
      console.log(`❌ Failed: ${this.results.failed}`);
      console.log(`⏱️ Duration: ${totalDuration.toFixed(2)}ms`);
      
      if (this.results.errors.length > 0) {
        console.log('\n🚨 Errors:');
        this.results.errors.forEach((error, index) => {
          console.log(`${index + 1}. [${error.suite}] ${error.test}: ${error.error}`);
        });
      }

      // Export results
      window.SwaggerEnhancerTestResults = this.results;
      console.log('\n📊 Results exported to window.SwaggerEnhancerTestResults');
      
      return this.results;
    }

    /**
     * Assertion helpers
     */
    assert(condition, message) {
      if (!condition) {
        throw new Error(message || 'Assertion failed');
      }
    }

    assertEqual(actual, expected, message) {
      if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
      }
    }

    assertTrue(value, message) {
      this.assertEqual(value, true, message);
    }

    assertFalse(value, message) {
      this.assertEqual(value, false, message);
    }

    assertExists(value, message) {
      if (!value) {
        throw new Error(message || 'Value should exist');
      }
    }

    assertContains(array, item, message) {
      if (!array.includes(item)) {
        throw new Error(message || `Array should contain ${item}`);
      }
    }
  }

  // Create global test runner
  window.TestRunner = TestRunner;
  window.testRunner = new TestRunner();

  // runTests function is injected into page context by main.js

  // Define test suites
  const defineTests = () => {
    // Core functionality tests
    testRunner.suite('Core', {
      'Extension loaded': () => {
        testRunner.assertExists(window.SwaggerEnhancerUtils, 'SwaggerEnhancerUtils should be loaded');
        testRunner.assertExists(window.SwaggerEnhancerFeatureManager, 'FeatureManager should be loaded');
        testRunner.assertTrue(window.SwaggerEnhancerFeatureManager.initialized, 'FeatureManager should be initialized');
      },

      'Features available': () => {
        const requiredClasses = ['ThemeFeature', 'SearchFeature', 'FavoritesFeature', 'ScrollTopFeature', 'HideResponsesFeature', 'HideSchemasFeature'];
        requiredClasses.forEach(className => {
          testRunner.assertExists(window[className], `${className} should be loaded`);
        });
      }
    });

    // Feature functionality tests
    testRunner.suite('Features', {
      'Features toggle correctly': async () => {
        const features = ['theme', 'search', 'favorites'];
        
        for (const featureName of features) {
          const feature = window.SwaggerEnhancerFeatureManager.getFeature(featureName);
          testRunner.assertExists(feature, `${featureName} feature should exist`);
          
          const initialState = feature.isEnabled();
          feature.toggle();
          await new Promise(resolve => setTimeout(resolve, 50));
          
          testRunner.assertEqual(feature.isEnabled(), !initialState, `${featureName} toggle should work`);
          
          // Restore state
          feature.toggle();
        }
      }
    });

    // DOM tests
    testRunner.suite('DOM', {
      'UI elements exist': () => {
        const menu = document.querySelector('#swagger-floating-menu');
        testRunner.assertExists(menu, 'Floating menu should exist');
        
        // Check if Swagger UI is present
        const swaggerUI = document.querySelector('.swagger-ui');
        testRunner.assertExists(swaggerUI, 'Swagger UI should be present');
      }
    });

    // CSS tests
    testRunner.suite('CSS', {
      'Styles loaded': () => {
        // Check if floating menu has proper positioning
        const menu = document.querySelector('#swagger-floating-menu');
        if (menu) {
          const computedStyle = getComputedStyle(menu);
          const hasPosition = computedStyle.position === 'fixed' || computedStyle.position === 'absolute';
          testRunner.assertTrue(hasPosition, 'Floating menu should have proper positioning');
        } else {
          testRunner.assertTrue(false, 'Floating menu element should exist');
        }
      }
    });

    // Performance tests
    testRunner.suite('Performance', {
      'Performance check': () => {
        const start = performance.now();
        
        // Quick DOM operations
        for (let i = 0; i < 50; i++) {
          document.querySelector('.swagger-ui');
        }
        
        const duration = performance.now() - start;
        testRunner.assertTrue(duration < 50, `DOM queries should be fast (${duration.toFixed(2)}ms)`);
      }
    });

    // Storage tests
    testRunner.suite('Storage', {
      'Storage works': async () => {
        testRunner.assertExists(chrome.storage, 'Chrome storage API should be accessible');
        
        return new Promise((resolve, reject) => {
          chrome.storage.sync.get(null, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(`Storage read failed: ${chrome.runtime.lastError.message}`));
            } else {
              testRunner.assertExists(result, 'Storage read should return data');
              resolve();
            }
          });
        });
      }
    });
  };

  // Define tests but don't auto-run
  defineTests();

  // Export convenience functions
  window.runTests = () => testRunner.runAll();
  window.runSuite = (name) => {
    const suite = testRunner.tests.get(name);
    if (suite) {
      testRunner.runSuite(name, suite);
    } else {
      console.error(`Suite '${name}' not found`);
    }
  };

  // Export to global scope
  window.testRunner = testRunner;
  
  // Export functions to global scope
  window.runTests = () => testRunner.runAll();
  window.runSuite = (name) => {
    const suite = testRunner.tests.get(name);
    if (suite) {
      testRunner.runSuite(name, suite);
    } else {
      console.error(`Suite '${name}' not found`);
    }
  };

  // console.log('🧪 Test Runner loaded. Use runTests() or runSuite("SuiteName") to run tests.');
  // console.log('🧪 runTests function available:', typeof window.runTests);

})();
