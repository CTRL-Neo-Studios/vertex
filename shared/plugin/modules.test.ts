import {expect, test} from 'vitest'
import {namedIn} from './modules'

test('the components a plugin\'s code names, in any quotes', () => {
    const code = 'const a=resolveComponent("UButton"),b=h(resolveComponent(\'UTooltip\')),c=r(`UModal`);const UBadge=1;"UButtonGroup"'
    expect(namedIn(code, ['UButton', 'UTooltip', 'UModal', 'UBadge', 'UInput'])).toEqual(['UButton', 'UTooltip', 'UModal'])
    expect(namedIn('', ['UButton'])).toEqual([])
})
