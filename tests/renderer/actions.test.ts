import { describe, expect, it } from 'vitest';
import { normaliserAdresse } from '../../src/renderer/editor/actions';

describe('adresses de liens', () => {
  it('ajoute https:// quand il manque', () => {
    expect(normaliserAdresse('exemple.fr')).toBe('https://exemple.fr');
    expect(normaliserAdresse('  exemple.fr/page?x=1  ')).toBe('https://exemple.fr/page?x=1');
    expect(normaliserAdresse('localhost:8080/test')).toBe('https://localhost:8080/test');
  });

  it('garde les protocoles autorisés', () => {
    expect(normaliserAdresse('http://exemple.fr')).toBe('http://exemple.fr');
    expect(normaliserAdresse('HTTPS://exemple.fr')).toBe('HTTPS://exemple.fr');
    expect(normaliserAdresse('mailto:a@exemple.fr')).toBe('mailto:a@exemple.fr');
    expect(normaliserAdresse('tel:+33123456789')).toBe('tel:+33123456789');
  });

  it('refuse les autres protocoles', () => {
    for (const danger of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'ftp://exemple.fr']) {
      expect(normaliserAdresse(danger), danger).toBeNull();
    }
  });
});
