import { useCallback, useState } from 'react'
import { startOfMonth, endOfMonth } from 'date-fns'
import { Tabs } from 'decentraland-ui/dist/components/Tabs/Tabs'
import { DateRangePicker } from './components/DateRangePicker'
import { CuratorFeesCalculator } from './components/CuratorFeesCalculator'
import { CuratorFeesReport } from './components/CuratorFeesReport'
import { DateRange, CuratorFeesSummary, RangeType } from './types'
import './App.css'

function App() {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    // If current month is not over, use today as end date
    const toDate = now < monthEnd ? now : monthEnd;
    
    return {
      from: monthStart,
      to: toDate
    };
  });

  const [rangeType, setRangeType] = useState<RangeType>('month');
  const [curatorFees, setCuratorFees] = useState<CuratorFeesSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleDateRangeChange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
  }, []);

  const handleRangeTypeChange = useCallback((newRangeType: RangeType) => {
    setRangeType(newRangeType);
  }, []);

  const handleFeesCalculated = useCallback((fees: CuratorFeesSummary[]) => {
    setCuratorFees(fees);
  }, []);

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-content">
          <h1 className="app-title">DCL DAO Council</h1>
        </div>
        <nav className="app-navigation" aria-label="DCL DAO Council sections">
          <Tabs className="app-tabs">
            <Tabs.Tab active>Curators</Tabs.Tab>
          </Tabs>
        </nav>
      </header>

      <main className="app">
        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
          rangeType={rangeType}
          onRangeTypeChange={handleRangeTypeChange}
        />
        
        <CuratorFeesCalculator
          dateRange={dateRange}
          onFeesCalculated={handleFeesCalculated}
          onLoadingChange={handleLoadingChange}
        />
        
        <CuratorFeesReport
          fees={curatorFees}
          dateRange={dateRange}
          isLoading={isLoading}
        />
      </main>
    </div>
  )
}

export default App
