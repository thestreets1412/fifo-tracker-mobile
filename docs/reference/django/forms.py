from django import forms
from django.contrib.auth.forms import AuthenticationForm, UsernameField
from .models import StockLot, Symbol
from .services import fetch_usd_thb_rate, FxRateFetchError

class StyledSelect(forms.Select):
    def create_option(self, name, value, label, selected, index, subindex=None, attrs=None):
        option = super().create_option(name, value, label, selected, index, subindex, attrs)
        # if value == "":  # the empty/placeholder option
        option['attrs']['style'] = 'color: black;'
        return option

class BootstrapAuthenticationForm(AuthenticationForm):
    # Redeclaring these fields drops the autocomplete hints AuthenticationForm
    # sets by default, which is what lets a password manager fill the form.
    username = UsernameField(
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'autofocus': True,
            'autocomplete': 'username',
        })
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'autocomplete': 'current-password',
        })
    )


class StockLotForm(forms.ModelForm):
    class Meta:
        model = StockLot
        fields = ['symbol', 'buy_date', 'price_usd', 'qty', 'fx_rate_usd_thb', 'evidence']
        widgets = {
            'symbol': StyledSelect(attrs={'class': 'form-select'}), # forms.Select(attrs={'class': 'form-select'}),
            'buy_date': forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
            'price_usd': forms.NumberInput(attrs={'class': 'form-control'}),
            'qty': forms.NumberInput(attrs={'class': 'form-control'}),
            'fx_rate_usd_thb': forms.NumberInput(attrs={'class': 'form-control'}),
            'evidence': forms.ClearableFileInput(attrs={'class': 'form-control'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['fx_rate_usd_thb'].required = False
        self.fields['fx_rate_usd_thb'].help_text = 'Leave blank to auto-fetch the USD/THB rate for the buy date.'

    def clean_fx_rate_usd_thb(self):
        rate = self.cleaned_data.get('fx_rate_usd_thb')
        if rate:
            return rate
        buy_date = self.cleaned_data.get('buy_date')
        if not buy_date:
            raise forms.ValidationError('Enter a buy date first, or fill in FX rate manually.')
        try:
            return fetch_usd_thb_rate(buy_date)
        except FxRateFetchError as exc:
            raise forms.ValidationError(str(exc))


class SellForm(forms.Form):
    """
    NOT a ModelForm — there's no single model that maps directly to
    'a sale request'. This form just collects input; record_sale()
    does the actual work of creating Sale + SaleAllocation rows.
    """
    symbol = forms.ModelChoiceField(
        queryset=Symbol.objects.all(),
        widget= StyledSelect(attrs={'class': 'form-select'}), # forms.Select(attrs={'class': 'form-select'}),
    )
    sell_date = forms.DateField(
        widget=forms.DateInput(attrs={'type': 'date', 'class': 'form-control'}),
    )
    qty_sold = forms.DecimalField(max_digits=18,
                                  decimal_places=8,
                                  min_value=0.00000001,
                                  widget=forms.NumberInput(attrs={'class': 'form-control'}))
    sale_price_usd = forms.DecimalField(max_digits=14,
                                        decimal_places=6,
                                        min_value=0,
                                        widget=forms.NumberInput(attrs={'class': 'form-control'}))
    fee_usd = forms.DecimalField(max_digits=10,
                                 decimal_places=4,
                                 min_value=0, initial=0,
                                 widget=forms.NumberInput(attrs={'class': 'form-control'}))
    fx_rate_usd_thb = forms.DecimalField(max_digits=10,
                                         decimal_places=4, min_value=0,
                                         required=False,
                                         help_text='Leave blank to auto-fetch the USD/THB rate for the sell date.',
                                         widget=forms.NumberInput(attrs={'class': 'form-control'}))
    evidence = forms.ImageField(
        required=False,
        widget=forms.ClearableFileInput(attrs={'class': 'form-control'}),
    )

    def clean_fx_rate_usd_thb(self):
        rate = self.cleaned_data.get('fx_rate_usd_thb')
        if rate:
            return rate
        sell_date = self.cleaned_data.get('sell_date')
        if not sell_date:
            raise forms.ValidationError('Enter a sell date first, or fill in FX rate manually.')
        try:
            return fetch_usd_thb_rate(sell_date)
        except FxRateFetchError as exc:
            raise forms.ValidationError(str(exc))
