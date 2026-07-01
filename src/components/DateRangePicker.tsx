import { startOfMonth, endOfMonth, format } from 'date-fns';
import { DateRange, RangeType } from '../types';

interface DateRangePickerProps {
  dateRange: DateRange;
  onDateRangeChange: (dateRange: DateRange) => void;
  rangeType: RangeType;
  onRangeTypeChange: (type: RangeType) => void;
}

export function DateRangePicker({ 
  dateRange, 
  onDateRangeChange, 
  rangeType, 
  onRangeTypeChange 
}: DateRangePickerProps) {
  const selectedMonth = format(dateRange.from, 'yyyy-MM');

  const handleMonthChange = (monthValue: string) => {
    const [year, month] = monthValue.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const now = new Date();
    
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    
    // If it's the current month and not over, use today as end date
    const isCurrentMonth = year === now.getFullYear() && month - 1 === now.getMonth();
    const toDate = isCurrentMonth && now < monthEnd ? now : monthEnd;
    
    const newDateRange = {
      from: monthStart,
      to: toDate
    };
    
    onDateRangeChange(newDateRange);
    onRangeTypeChange('month');
  };

  const handleFromDateChange = (value: string) => {
    // Parse date in local timezone to avoid timezone shift
    const [year, month, day] = value.split('-').map(Number);
    const newFrom = new Date(year, month - 1, day);
    onDateRangeChange({
      ...dateRange,
      from: newFrom
    });
    onRangeTypeChange('custom');
  };

  const handleToDateChange = (value: string) => {
    // Parse date in local timezone to avoid timezone shift
    const [year, month, day] = value.split('-').map(Number);
    const newTo = new Date(year, month - 1, day);
    newTo.setHours(23, 59, 59, 999); // Set to end of day
    onDateRangeChange({
      ...dateRange,
      to: newTo
    });
    onRangeTypeChange('custom');
  };

  const formatDateForInput = (date: Date) => {
    return format(date, 'yyyy-MM-dd');
  };

  const getMaxDate = () => {
    return format(new Date(), 'yyyy-MM-dd');
  };

  const getMaxMonth = () => {
    return format(new Date(), 'yyyy-MM');
  };

  const getRangeLabel = () => {
    if (rangeType === 'month') {
      return format(dateRange.from, 'MMMM yyyy');
    } else {
      return 'Custom Range';
    }
  };

  return (
    <div className="date-range-picker">
      <div className="range-info">
        <h2>Curator Fees Report - {getRangeLabel()}</h2>
      </div>
      
      <div className="picker-controls">
        <div className="month-picker">
          <label htmlFor="month-select">Quick Select Month:</label>
          <input
            id="month-select"
            type="month"
            value={selectedMonth}
            max={getMaxMonth()}
            onChange={(e) => handleMonthChange(e.target.value)}
          />
        </div>

        <div className="date-range-inputs">
          <div className="date-input">
            <label htmlFor="from-date">From:</label>
            <input
              id="from-date"
              type="date"
              value={formatDateForInput(dateRange.from)}
              max={getMaxDate()}
              onChange={(e) => handleFromDateChange(e.target.value)}
            />
          </div>

          <div className="date-input">
            <label htmlFor="to-date">To:</label>
            <input
              id="to-date"
              type="date"
              value={formatDateForInput(dateRange.to)}
              max={getMaxDate()}
              onChange={(e) => handleToDateChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
