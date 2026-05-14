# Manual Test: Domain Filter on Findings Page

## Test Steps

### Test 1: Direct URL Navigation
1. Open browser and navigate to:
   ```
   https://red-coast-0b2d8700f.7.azurestaticapps.net/arb?reviewId=dupont-landing-zone&step=findings&domain=Security
   ```
2. **Expected Result**: 
   - The "Security" filter chip should be highlighted/active
   - Only Security domain findings should be displayed
   - The filter count should show "X of Y findings" where X < Y

### Test 2: Navigation from Scorecard
1. Navigate to the Scorecard page:
   ```
   https://red-coast-0b2d8700f.7.azurestaticapps.net/arb?reviewId=dupont-landing-zone&step=scorecard
   ```
2. Expand the "Security" domain section
3. Click "View all X findings →"
4. **Expected Result**:
   - You should land on the Findings page
   - The "Security" filter chip should be highlighted/active
   - Only Security domain findings should be displayed

### Test 3: Clear Filter
1. After Test 1 or Test 2, click "Clear filters" button
2. **Expected Result**:
   - All findings should now be displayed
   - No filter chips should be highlighted

## Troubleshooting

If the filter is not being applied:

1. **Hard refresh the page** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Clear browser cache** for the site
3. **Check browser console** for any JavaScript errors

## Technical Details

The fix uses a lazy useState initializer to read the `domain` query parameter from the URL on first render:

```typescript
const [filters, setFilters] = useState<FindingsFilterState>(() => {
  const domain = searchParams?.get("domain");
  return {
    severities: new Set<string>(),
    domains: domain ? new Set([domain]) : new Set<string>(),
    statuses: new Set<string>(),
  };
});
```

Plus a useEffect to sync when URL changes after initial render:

```typescript
useEffect(() => {
  const domain = searchParams.get("domain");
  if (domain) {
    setFilters((prev) => ({
      ...prev,
      domains: new Set([domain]),
    }));
  }
}, [searchParams]);
```
