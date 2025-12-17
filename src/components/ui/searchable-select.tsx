/**
 * SearchableSelect - A searchable dropdown component
 * 
 * Features:
 * - Async data loading from Supabase
 * - Real-time search/filter
 * - Single or multi-select modes
 * - Custom render for options
 */

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface SelectOption {
    value: string;
    label: string;
    description?: string;
    category?: string;
    onSearch?: (term: string) => void;
    externalSearch?: boolean;
}

// Single Select Component
export function SearchableSelect({
    options,
    value,
    onValueChange,
    placeholder = "Sélectionner...",
    searchPlaceholder = "Rechercher...",
    emptyMessage = "Aucun résultat trouvé",
    loading = false,
    disabled = false,
    className,
    onSearch,
    externalSearch = false,
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const filteredOptions = React.useMemo(() => {
        if (externalSearch) return options; // Return all options provided by parent
        if (!search) return options.slice(0, 100); // Limit initial display
        const searchLower = search.toLowerCase();
        return options
            .filter(
                (option) =>
                    option.label.toLowerCase().includes(searchLower) ||
                    option.description?.toLowerCase().includes(searchLower) ||
                    option.category?.toLowerCase().includes(searchLower)
            )
            .slice(0, 100);
    }, [options, search, externalSearch]);

    const selectedOption = options.find((opt) => opt.value === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled || loading}
                    className={cn("w-full justify-between", className)}
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Chargement...
                        </span>
                    ) : selectedOption ? (
                        <span className="truncate">{selectedOption.label}</span>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                            <ScrollArea className="h-[300px]">
                                {filteredOptions.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        onSelect={() => {
                                            onValueChange(option.value === value ? "" : option.value);
                                            setOpen(false);
                                            setSearch("");
                                        }}
                                        className="cursor-pointer"
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === option.value ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="truncate font-medium">{option.label}</div>
                                            {option.description && (
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {option.description}
                                                </div>
                                            )}
                                        </div>
                                        {option.category && (
                                            <Badge variant="outline" className="ml-2 text-xs shrink-0">
                                                {option.category}
                                            </Badge>
                                        )}
                                    </CommandItem>
                                ))}
                            </ScrollArea>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// Multi Select Component
export function SearchableMultiSelect({
    options,
    values,
    onValuesChange,
    placeholder = "Sélectionner...",
    searchPlaceholder = "Rechercher...",
    emptyMessage = "Aucun résultat trouvé",
    loading = false,
    disabled = false,
    maxDisplay = 3,
    className,
}: SearchableMultiSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const filteredOptions = React.useMemo(() => {
        if (!search) return options.slice(0, 100);
        const searchLower = search.toLowerCase();
        return options
            .filter(
                (option) =>
                    option.label.toLowerCase().includes(searchLower) ||
                    option.description?.toLowerCase().includes(searchLower) ||
                    option.category?.toLowerCase().includes(searchLower)
            )
            .slice(0, 100);
    }, [options, search]);

    const selectedOptions = options.filter((opt) => values.includes(opt.value));

    const handleSelect = (selectedValue: string) => {
        if (values.includes(selectedValue)) {
            onValuesChange(values.filter((v) => v !== selectedValue));
        } else {
            onValuesChange([...values, selectedValue]);
        }
    };

    const handleRemove = (e: React.MouseEvent, valueToRemove: string) => {
        e.stopPropagation();
        onValuesChange(values.filter((v) => v !== valueToRemove));
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled || loading}
                    className={cn("w-full justify-between h-auto min-h-10", className)}
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Chargement...
                        </span>
                    ) : selectedOptions.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {selectedOptions.slice(0, maxDisplay).map((option) => (
                                <Badge
                                    key={option.value}
                                    variant="secondary"
                                    className="text-xs"
                                    onClick={(e) => handleRemove(e, option.value)}
                                >
                                    {option.label}
                                    <X className="ml-1 h-3 w-3 cursor-pointer hover:text-destructive" />
                                </Badge>
                            ))}
                            {selectedOptions.length > maxDisplay && (
                                <Badge variant="outline" className="text-xs">
                                    +{selectedOptions.length - maxDisplay}
                                </Badge>
                            )}
                        </div>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                        <input
                            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <CommandList>
                        <CommandEmpty>{emptyMessage}</CommandEmpty>
                        <CommandGroup>
                            <ScrollArea className="h-[300px]">
                                {filteredOptions.map((option) => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        onSelect={() => handleSelect(option.value)}
                                        className="cursor-pointer"
                                    >
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                values.includes(option.value)
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50"
                                            )}
                                        >
                                            {values.includes(option.value) && (
                                                <Check className="h-3 w-3" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="truncate font-medium">{option.label}</div>
                                            {option.description && (
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {option.description}
                                                </div>
                                            )}
                                        </div>
                                        {option.category && (
                                            <Badge variant="outline" className="ml-2 text-xs shrink-0">
                                                {option.category}
                                            </Badge>
                                        )}
                                    </CommandItem>
                                ))}
                            </ScrollArea>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export default SearchableSelect;
