import type { AssertionError } from 'assert'
import { assert, describe, expect, test, vi, vitest } from 'vitest'
// @ts-expect-error not typed module
import { value as virtualValue } from 'virtual-module'
import { two } from '../src/submodule'
import * as mocked from '../src/mockedA'
import { mockedB } from '../src/mockedB'
import { MockedC, asyncFunc, exportedStream } from '../src/mockedC'
import MockedDefault, { MockedC as MockedD } from '../src/mockedD'
import * as globalMock from '../src/global-mock'

vitest.mock('../src/submodule')
vitest.mock('virtual-module', () => ({ value: 'mock' }))
vitest.mock('../src/mockedC')
vitest.mock('../src/mockedD')

/**
 * Get a property descriptor from an object.
 *
 * This is different from `Object.getOwnPropertyDescriptor` because it recurses
 * into the prototype chain until it either finds a match or reaches the end.
 *
 * @param object The object that contains the property.
 * @param property The property.
 * @returns The property's descriptor, or undefined if no matching property was found.
 */
function getPropertyDescriptor(object: any, property: PropertyKey) {
  for (let o = object; o; o = Object.getPrototypeOf(o)) {
    const descriptor = Object.getOwnPropertyDescriptor(o, property)
    if (descriptor)
      return descriptor
  }
  return undefined
}

test('submodule is mocked to return "two" as 3', () => {
  assert.equal(3, two)
})

test('globally mocked files are mocked', () => {
  // Mocked in setup.ts
  expect(globalMock.mocked).toBe(true)
})

test('can mock esm', () => {
  const spy = vi.spyOn(mocked, 'mockedA')

  mockedB()

  expect(spy).toHaveBeenCalled()
  expect(spy).toHaveReturnedWith('A')
})

test('mocked exports should override original exports', () => {
  expect(virtualValue).toBe('mock')
})

describe('mocked classes', () => {
  test('should not delete the prototype', () => {
    expect(MockedC).toBeTypeOf('function')
    expect(MockedC.prototype.doSomething).toBeTypeOf('function')
    expect(MockedC.prototype.constructor).toBe(MockedC)
  })

  test('should mock the constructor', () => {
    const instance = new MockedC()

    expect(instance.value).not.toBe(42)
    expect(MockedC).toHaveBeenCalledOnce()
  })

  test('should mock functions in the prototype', () => {
    const instance = new MockedC()

    expect(instance.doSomething).toBeTypeOf('function')
    expect(instance.doSomething()).not.toBe('A')

    expect(MockedC.prototype.doSomething).toHaveBeenCalledOnce()
    expect(MockedC.prototype.doSomething).not.toHaveReturnedWith('A')
  })

  test('should mock getters', () => {
    const instance = new MockedC()

    expect(instance).toHaveProperty('getOnlyProp')
    const descriptor = getPropertyDescriptor(instance, 'getOnlyProp')
    expect(descriptor?.get).toBeDefined()
    expect(descriptor?.set).not.toBeDefined()

    expect(instance.getOnlyProp).toBe(42)
    // @ts-expect-error Assign to the read-only prop to ensure it errors.
    expect(() => instance.getOnlyProp = 4).toThrow()

    const getterSpy = vi.spyOn(instance, 'getOnlyProp', 'get').mockReturnValue(456)
    expect(instance.getOnlyProp).toEqual(456)
    expect(getterSpy).toHaveBeenCalledOnce()
  })

  test('should mock getters and setters', () => {
    const instance = new MockedC()

    expect(instance).toHaveProperty('getSetProp')
    const descriptor = getPropertyDescriptor(instance, 'getSetProp')
    expect(descriptor?.get).toBeDefined()
    expect(descriptor?.set).toBeDefined()

    expect(instance.getSetProp).toBe(123)
    expect(() => instance.getSetProp = 4).not.toThrow()

    const getterSpy = vi.spyOn(instance, 'getSetProp', 'get').mockReturnValue(789)
    expect(instance.getSetProp).toEqual(789)
    expect(getterSpy).toHaveBeenCalledOnce()

    const setterSpy = vi.spyOn(instance, 'getSetProp', 'set')
    instance.getSetProp = 159
    expect(setterSpy).toHaveBeenCalledWith(159)
  })
})

describe('default exported classes', () => {
  test('should preserve equality for re-exports', () => {
    expect(MockedDefault).toEqual(MockedD)
  })

  test('should preserve prototype', () => {
    expect(MockedDefault.prototype.constructor).toBe(MockedDefault)
    expect(MockedD.prototype.constructor).toBe(MockedD)
  })
})

test('async functions should be mocked', () => {
  expect(asyncFunc()).toBeUndefined()
  expect(vi.mocked(asyncFunc).mockResolvedValue).toBeDefined()
  vi.mocked(asyncFunc).mockResolvedValue('foo')
  expect(asyncFunc()).resolves.toBe('foo')
})

describe('mocked function which fails on toReturnWith', () => {
  test('zero call', () => {
    const mock = vi.fn(() => 1)
    try {
      expect(mock).toReturnWith(2)
    }
    catch (e) {
      const throwObj = e as AssertionError
      expect(throwObj.message).toMatchInlineSnapshot(`
        "expected \\"spy\\" to return with: 2 at least once[90m

        Received: 
        [39m[90m

        Number of calls: [1m0[22m
        [39m"
      `)
    }
  })

  test('just one call', () => {
    const mock = vi.fn(() => 1)
    mock()
    try {
      expect(mock).toReturnWith(2)
    }
    catch (e) {
      const throwObj = e as AssertionError
      expect(throwObj.message).toMatchInlineSnapshot(`
        "expected \\"spy\\" to return with: 2 at least once[90m

        Received: 
        [1m    1st spy call return:

        [22m  [32m2[90m
          [31m1[90m
        [39m[90m

        Number of calls: [1m1[22m
        [39m"
      `)
    }
  })

  test('multi calls', () => {
    const mock = vi.fn(() => 1)
    mock()
    mock()
    mock()
    try {
      expect(mock).toReturnWith(2)
    }
    catch (e) {
      const throwObj = e as AssertionError
      expect(throwObj.message).toMatchInlineSnapshot(`
        "expected \\"spy\\" to return with: 2 at least once[90m

        Received: 
        [1m    1st spy call return:

        [22m  [32m2[90m
          [31m1[90m

        [1m    2nd spy call return:

        [22m  [32m2[90m
          [31m1[90m

        [1m    3rd spy call return:

        [22m  [32m2[90m
          [31m1[90m
        [39m[90m

        Number of calls: [1m3[22m
        [39m"
      `)
    }
  })

  test('oject type', () => {
    const mock = vi.fn(() => { return { a: '1' } })
    mock()
    mock()
    mock()

    try {
      expect(mock).toReturnWith({ a: '4' })
    }
    catch (e) {
      const throwObj = e as AssertionError
      expect(throwObj.message).toMatchInlineSnapshot(`
        "expected \\"spy\\" to return with: { a: '4' } at least once[90m

        Received: 
        [1m    1st spy call return:

        [22m    Object {
          [32m-   \\"a\\": \\"4\\",[90m
          [31m+   \\"a\\": \\"1\\",[90m
            }

        [1m    2nd spy call return:

        [22m    Object {
          [32m-   \\"a\\": \\"4\\",[90m
          [31m+   \\"a\\": \\"1\\",[90m
            }

        [1m    3rd spy call return:

        [22m    Object {
          [32m-   \\"a\\": \\"4\\",[90m
          [31m+   \\"a\\": \\"1\\",[90m
            }
        [39m[90m

        Number of calls: [1m3[22m
        [39m"
      `)
    }
  })
})

// This is here because mocking streams previously caused some problems (#1671).
test('streams', () => {
  expect(exportedStream).toBeDefined()
})
