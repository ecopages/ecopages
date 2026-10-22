const longDate = new Intl.DateTimeFormat('en', { dateStyle: 'long' });

export const formatDate = (date: Date) => longDate.format(date);
