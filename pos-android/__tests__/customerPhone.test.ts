import { normalizeCustomerPhone, restrictPhoneInput, customerPhoneAliases } from '../src/utils/customerPhone';

describe('nomor member Android', () => {
    test('nomor 08 dan +62 dinormalisasi ke nomor yang sama', () => {
        expect(normalizeCustomerPhone('081234567890')).toBe('+6281234567890');
        expect(normalizeCustomerPhone('+62 812-3456-7890')).toBe('+6281234567890');
        expect(customerPhoneAliases('+6281234567890')).toContain('081234567890');
    });
    test('input menjaga nol awal dan membuang huruf serta + di tengah', () => {
        expect(restrictPhoneInput('0812abc3456789')).toBe('08123456789');
        expect(restrictPhoneInput('+62+8123456789')).toBe('+628123456789');
        expect(() => normalizeCustomerPhone('nama')).toThrow('Nomor HP');
    });
});
