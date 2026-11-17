import {describe, expect, it} from 'vitest'
import {gitConfigOf} from './config'

describe('gitConfigOf', () => {
    it('keeps auto-sync off unless each part is turned on, with a positive interval', () => {
        expect(gitConfigOf()).toEqual({
            path: '',
            autoSync: {interval: 0, onOpen: false, pullOnFocus: false},
            commitMessages: {autoSync: false, whenEmpty: true},
        })
        expect(gitConfigOf({autoSync: {interval: 15, onOpen: true, pullOnFocus: true}}).autoSync).toEqual({interval: 15, onOpen: true, pullOnFocus: true})
        for (const interval of [-5, Number.NaN, Infinity, '15']) {
            expect(gitConfigOf({autoSync: {interval, onOpen: 'yes'}}).autoSync).toEqual({interval: 0, onOpen: false, pullOnFocus: false})
        }
    })

    it('writes commit messages on an empty box unless turned off; auto-sync\'s only when turned on', () => {
        expect(gitConfigOf({commitMessages: {autoSync: 'yes', whenEmpty: 0}}).commitMessages).toEqual({autoSync: false, whenEmpty: true})
        expect(gitConfigOf({commitMessages: {autoSync: true, whenEmpty: false}}).commitMessages).toEqual({autoSync: true, whenEmpty: false})
    })
})
