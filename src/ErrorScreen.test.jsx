// src/ErrorScreen.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import ErrorScreen from './ErrorScreen';

describe('ErrorScreen', () => {
  test('renders the error message', () => {
    render(<ErrorScreen message="Network unavailable" />);
    expect(screen.getByText('Network unavailable')).toBeInTheDocument();
  });

  test('renders a different message', () => {
    render(<ErrorScreen message="No photos found in album" />);
    expect(screen.getByText('No photos found in album')).toBeInTheDocument();
  });
});
