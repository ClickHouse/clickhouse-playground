import * as React from 'react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import { SxProps, Theme } from '@mui/material/styles';

export type SelectDropdownProps = {
  id: string;
  options: string[];
  value: string;
  onChange: (newValue: string) => void;
  disabled: boolean;
  label: string;
  sx: SxProps<Theme>;
  disableDisplay: boolean;
};

export default function SelectDropdown(props: SelectDropdownProps) {
  const {
    id, options, value, disabled, onChange, label, sx, disableDisplay,
  } = props;

  return (
    <Autocomplete
      id={id}
      sx={{
        ...sx,
        display: disableDisplay ? { xs: 'none', sm: 'block' } : 'block',
        '& .MuiAutocomplete-listbox .MuiAutocomplete-option': {
          whiteSpace: 'nowrap',
        },
      }}
      disableClearable
      autoSelect
      options={options}
      value={value}
      disabled={disabled}
      onChange={(e, newValue) => onChange(newValue)}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="outlined"
          label={label}
          InputProps={{
            ...params.InputProps,
            type: 'search',
          }}
        />
      )}
      ListboxProps={{
        style: { overflowX: 'auto' },
      }}
    />
  );
}
