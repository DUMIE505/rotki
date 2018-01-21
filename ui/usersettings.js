var settings = require("./settings.js")();
require("./elements.js")();
require("./asset_table.js")();
require("./utils.js")();

let FIAT_TABLE = null;
let FIAT_BALANCES = null;
let OWNED_TOKENS = null;
let BLOCKCHAIN_BALANCES = null;
let BB_PER_ASSET_TABLE = null;
let BB_PER_ACCOUNT_TABLES = [];
// awesome idea of template string plus destructuring/mapping taken from:
// https://stackoverflow.com/a/39065147/110395
const ExchangeBadge = ({ name, css_class }) => `
<div id="${name}_badge" class="col-sm-6 col-lg-3">
  <div style="margin-top: 5px;" class="row">
    <div class="col-xs-3"><i><img title="${name}" class="${css_class}" src="images/${name}.png" /></i>
    </div>
    <div class="col-xs-offset-1"></div>
    <div style="margin-left:5px;" class="col-xs-2">
      <div style="font-size:28px;">${name}</div>
    </div>
  </div>
</div>
`;

function disable_exchange_entry(selector_text, value) {
    $(selector_text).parent().removeClass().addClass('form-group input-group has-success');
    $(selector_text).attr('disabled', true);
    $(selector_text).val(value);
}

function enable_exchange_entry(selector_text) {
    $(selector_text).parent().removeClass().addClass('form-group input-group');
    $(selector_text).attr('disabled', false);
    $(selector_text).val('');
}

function disable_exchange_entries(val) {
    disable_exchange_entry('#api_key_entry', val + ' API Key is already registered');
    disable_exchange_entry('#api_secret_entry', val + ' API Secret is already registered');
    $('#setup_exchange_button').html('Remove');
}

function enable_exchange_entries() {
    enable_exchange_entry('#api_key_entry');
    enable_exchange_entry('#api_secret_entry');
    $('#setup_exchange_button').html('Setup');
}

function setup_exchange_callback(event) {
    event.preventDefault();
    let button_type = $('#setup_exchange_button').html();
    var exchange_name = $('#setup_exchange').val();
    if (button_type == 'Remove') {
        $.confirm({
            title: 'Confirmation Required',
            content: 'Are you sure you want to delete the API key and secret from rotkehlchen? This action is not undoable and you will need to obtain the key and secret again from the exchange.',
            buttons: {
                confirm: function () {
                    client.invoke(
                        "remove_exchange",
                        exchange_name,
                        (error, res) => {
                            if (error || res == null) {
                                showAlert('alert-danger', 'Error at removing ' + exchange_name + ' exchange: ' + error);
                                return;
                            }
                            // else
                            if (!res['result']) {
                                showAlert('alert-danger', 'Error at removing ' + exchange_name + ' exchange: ' + res['message']);
                                return;
                            }
                            // Exchange removal from backend succesfull
                            enable_exchange_entries();
                            $('#'+exchange_name+'_badge').remove();
                            var index = settings.connected_exchanges.indexOf(exchange_name);
                            if (index == -1) {
                                throw "Exchange " + exchange_name + "was not in connected_exchanges when trying to remove";
                            }
                            settings.connected_exchanges.splice(index, 1);

                        });
                },
                cancel: function () {}
            }
        });
        return;
    }
    // else simply add it
    let api_key = $('#api_key_entry').val();
    let api_secret = $('#api_secret_entry').val();
    client.invoke(
        "setup_exchange",
        exchange_name,
        api_key,
        api_secret,
        (error, res) => {
            if (error || res == null) {
                showAlert('alert-danger', 'Error at setup of ' + exchange_name + ': ' + error);
                return;
            }
            // else
            if (!res['result']) {
                showAlert('alert-danger', 'Error at setup of ' + exchange_name + ': ' + res['message']);
                return;
            }
            // Exchange setup in the backend was succesfull
            disable_exchange_entries(exchange_name);
            settings.connected_exchanges.push(exchange_name);
            let str = ExchangeBadge({name: exchange_name, css_class: 'exchange-icon'});
            $(str).appendTo($('#exchange_badges'));

        }
    );
}

function fiat_selection_callback(event) {
    if (!FIAT_BALANCES) {
        return;
    }

    if (FIAT_BALANCES.hasOwnProperty(this.value)) {
        $('#fiat_value_entry').val(FIAT_BALANCES[this.value]['amount']);
        $('#modify_fiat_button').html('Modify Balance');
    } else {
        $('#fiat_value_entry').val('');
        $('#modify_fiat_button').html('Add Balance');
    }
}

function fiat_modify_callback(event) {
    event.preventDefault();
    let button_type = $('#modify_fiat_button').html();
    let currency = $('#fiat_type_entry').val();
    let balance = $('#fiat_value_entry').val();

    client.invoke(
        "set_fiat_balance",
        currency,
        balance,
        (error, result) => {
            if (error || !result) {
                showAlert('alert-danger', 'Error at modifying ' + currency + ' balance: ' + error);
                return;
            }
            if (!result['result']) {
                showAlert('alert-danger', 'Error at modifying ' + currency + ' balance: ' + result['message']);
                return;
            }
            if (balance == '') {
                delete FIAT_BALANCES[currency];
            } else {
                FIAT_BALANCES[currency] = {'amount': balance, 'usd_value': get_fiat_usd_value(currency, balance)};
            }
            // simply add the new data to the table
            FIAT_TABLE.clear();
            let data = format_table_data(FIAT_BALANCES);
            FIAT_TABLE.rows.add(data);
            FIAT_TABLE.draw();
        });
}

function add_listeners() {
    $('#setup_exchange').change(function (event) {
        if (settings.connected_exchanges.indexOf(this.value) > -1) {
            disable_exchange_entries(this.value);
        } else {
            enable_exchange_entries();
        }
    });
    $('#setup_exchange_button').click(setup_exchange_callback);
    $('#fiat_type_entry').change(fiat_selection_callback);
    $('#modify_fiat_button').click(fiat_modify_callback);
}

function create_user_settings() {
    var str = page_header('User Settings');
    str += settings_panel('Exchange Settings', 'exchange');
    str += settings_panel('Fiat Balances', 'fiat_balances');
    str += settings_panel('Blockchain Balances', 'blockchain_balances');
    $('#page-wrapper').html(str);

    let badge_input = settings.connected_exchanges.map(x => ({name: x, css_class: 'exchange-icon'}));
    str = '<div id="exchange_badges" class="row">';
    str += badge_input.map(ExchangeBadge).join('');
    str += '</div>';

    str += form_select('Setup Exchange', 'setup_exchange', settings.EXCHANGES, '');
    str += form_entry('Api Key', 'api_key_entry', '', '');
    str += form_entry('Api Secret', 'api_secret_entry', '', '');
    str += form_button('Setup', 'setup_exchange_button');

    $(str).appendTo($('#exchange_panel_body'));

    // essentially call the on-select for the first choice
    let first_value = settings.EXCHANGES[0];
    if (settings.connected_exchanges.indexOf(first_value) > -1) {
        disable_exchange_entries(first_value);
    }

    str = form_select('Modify Balance', 'fiat_type_entry', settings.CURRENCIES.map(x=>x.ticker_symbol), settings.main_currency.ticker_symbol);
    str += form_entry('Balance', 'fiat_value_entry', '', '');
    str += form_button('Modify', 'modify_fiat_button');

    $(str).appendTo($('#fiat_balances_panel_body'));
    create_fiat_table();

    str += '<h4 class="centered-title">Add New Accounts to track</h4>';
    str = form_select('Choose Blockchain', 'crypto_type_entry', ['ETH', 'BTC'], '');
    str += form_entry('Account', 'account_entry', '', '');
    str += form_button('Add', 'add_account_button');
    str += form_multiselect('Select ETH tokens to track', 'eth_tokens_select', []);
    $(str).appendTo($('#blockchain_balances_panel_body'));

    populate_eth_tokens();
    str = '<h4 class="centered-title">Blockchain Balances Per Asset</h4>';
    str += loading_placeholder('blockchain_per_asset_placeholder');
    str += table_html(3, 'blockchain_per_asset');
    str += '<h4 class="centered-title">Blockchain Balances Per Account</h4>';
    str += loading_placeholder('blockchain_per_account_placeholder');
    $(str).appendTo($('#blockchain_balances_panel_body'));
    client.invoke('query_blockchain_balances_async', (error, result) => {
        if (error || result == null) {
            console.log("Error at querying blockchain balances async:" + error);
            return;
        }
        create_task(result['task_id'], 'user_settings_query_blockchain_balances', 'Query blockchain balances');
    });
    // also save the user settings page
    settings.page_usersettings = $('#page-wrapper').html();
}

let table_data_shortener = function (cutoff_start, keep_length) {
    var esc = function ( t ) {
        return t
            .replace( /&/g, '&amp;' )
            .replace( /</g, '&lt;' )
            .replace( />/g, '&gt;' )
            .replace( /"/g, '&quot;' );
    };

    return function (d, type, row) {
        // Order, search and type get the original data
        if (type !== 'display') {
            return d;
        }

        if (typeof d !== 'number' && typeof d !== 'string') {
            return d;
        }

        d = d.toString(); // cast numbers

        if (d.length < cutoff_start + keep_length) {
            return d;
        }

        var shortened = d.substr(cutoff_start, cutoff_start + keep_length - 1);
        return '<span class="ellipsis" title="'+esc(d)+'">'+shortened+'&#8230;</span>';
    };
};

function create_blockchain_balances_tables(result) {

    BLOCKCHAIN_BALANCES = result;

    $('#blockchain_per_asset_placeholder').remove();
    BB_PER_ASSET_TABLE = populate_asset_table(result['totals'], 'blockchain_per_asset_table');

    // now the per accounts tables
    $('#blockchain_per_account_placeholder').remove();
    let eth_accounts = result['per_account']['ETH'];
    if (eth_accounts) {
        let str = '<h3>ETH accounts</h3>';
        // columns are: one for each token amount, one for ETH, one for account, one for total usd value
        str += table_html(OWNED_TOKENS.length + 3, 'ethchain_per_account');
        $(str).appendTo($('#blockchain_balances_panel_body'));

        let data = [];
        for (let account in eth_accounts) {
            if (eth_accounts.hasOwnProperty(account)) {
                let account_data = eth_accounts[account];
                let eth_amount = parseFloat(account_data['ETH']);
                eth_amount = eth_amount.toFixed(settings.floating_precision);
                let total_usd_value = parseFloat(account_data['usd_value']);
                total_usd_value = total_usd_value.toFixed(settings.floating_precision);
                let row = {'account': account, 'ETH': eth_amount, 'total_usd_value': total_usd_value};
                for (let i = 0; i < OWNED_TOKENS.length; i ++ ) {
                    if (!account_data[OWNED_TOKENS[i]]) {
                        row[OWNED_TOKENS[i]] = 0;
                        continue;
                    }
                    let token_amount = parseFloat(account_data[OWNED_TOKENS[i]]);
                    token_amount = token_amount.toFixed(settings.floating_precision);
                    row[OWNED_TOKENS[i]] = token_amount;
                }
                data.push(row);
            }
        }
        let column_data = [
            {"data": "account", "title": "Account"},
            {"data": "ETH", "title": "ETH"}
        ];
        // if user has a lot of ETH tokens shorten the table by shortening the display of accounts
        if (OWNED_TOKENS.length > 4) {
            column_data[0]['render'] = table_data_shortener(2, 6);
        }
        for (let i = 0; i < OWNED_TOKENS.length; i ++ ) {
            column_data.push({"data": OWNED_TOKENS[i], "title": OWNED_TOKENS[i]});
        }

        column_data.push({
            "data": 'total_usd_value',
            "title": 'Total ' + settings.main_currency.ticker_symbol + ' Value',
            "render": function (data, type, row) {
                return format_currency_value(data);
            }
        });

        // now we have the data so create the table
        BB_PER_ACCOUNT_TABLES['ETH'] = $('#ethchain_per_account_table').DataTable({
            "data": data,
            "columns": column_data,
            "order": [[column_data.length - 1, 'desc']]
        });
    }// if eth accounts end

    let btc_accounts = result['per_account']['BTC'];
    if (btc_accounts) {
        let str = '<h3>BTC accounts</h3>';
        str += table_html(3, 'btcchain_per_account');
        $(str).appendTo($('#blockchain_balances_panel_body'));

        let data = [];
        for (let account in btc_accounts) {
            if (btc_accounts.hasOwnProperty(account)) {
                let account_data = btc_accounts[account];
                let amount = parseFloat(account_data['amount']);
                amount = amount.toFixed(settings.floating_precision);
                let usd_value = parseFloat(account_data['usd_value']);
                usd_value = usd_value.toFixed(settings.floating_precision);
                data.push({'account': account, 'amount': amount, 'usd_value': usd_value});
            }
        }
        BB_PER_ACCOUNT_TABLES['BTC'] = $('#btcchain_per_account_table').DataTable({
            "data": data,
            "columns": [
                {"data": "account", "title": "Account"},
                {"data": "amount", "title": "Amount"},
                {
                    "data": "usd_value",
                    "title": settings.main_currency.ticker_symbol + ' value',
                    "render": function (data, type, row) {
                        return format_currency_value(data);
                    }
                }
            ],
            "order": [[2, 'desc']]
        });
    }// if btc accounts end

    // also save the user settings page
    settings.page_usersettings = $('#page-wrapper').html();
}

function populate_eth_tokens() {
    client.invoke('get_eth_tokens', (error, result) => {
        if (error || result == null) {
            console.log("Error at getting ETH tokens:" + error);
            return;
        }
        $('#eth_tokens_select').multiSelect({
            selectableHeader: "<div class='custom-header'>All ETH Tokens</div>",
            selectionHeader: "<div class='custom-header'>My ETH Tokens</div>"
        });
        let all_tokens = result['all_eth_tokens'];
        OWNED_TOKENS = result['owned_eth_tokens'];
        for (let i = 0; i < all_tokens.length; i++) {
            let symbol = all_tokens[i]['symbol'];
            $('#eth_tokens_select').multiSelect('addOption', { value: symbol, text: symbol});

        }
        $('#eth_tokens_select').multiSelect('select', OWNED_TOKENS);
    });
}

function create_fiat_table() {
    client.invoke('query_fiat_balances', (error, result) => {
        if (error || result == null) {
            console.log("Error at querying fiat balances:" + error);
            return;
        }
        FIAT_BALANCES = result;
        let str = '<h4 class="centered-title">Owned Fiat Currency Balances</h4>';
        $(str).appendTo($('#fiat_balances_panel_body'));
        FIAT_TABLE = create_asset_table('fiat_balances', 'fiat_balances_panel_body', result);
        // also save the user settings page
        settings.page_usersettings = $('#page-wrapper').html();
    });
}

function reload_usersettings_tables_if_existing() {
    reload_asset_table(FIAT_TABLE);
    reload_asset_table(BB_PER_ASSET_TABLE);
    for (let currency in BB_PER_ACCOUNT_TABLES) {
        if (BB_PER_ACCOUNT_TABLES.hasOwnProperty(currency)) {
            let table = BB_PER_ACCOUNT_TABLES[currency];
            reload_table_currency_val_if_existing(table, 2);
        }
    }
}

function init_usersettings() {
    monitor_add_callback('user_settings_query_blockchain_balances', function (result) {
        create_blockchain_balances_tables(result);
    });
}

function create_or_reload_usersettings() {
    change_location('usersettings');
    if (!settings.page_usersettings) {
        console.log("At create/reload usersettings, with a null page index");
        create_user_settings();
    } else {
        console.log("At create/reload usersettings, with a Populated page index");
        $('#page-wrapper').html(settings.page_usersettings);
    }
    add_listeners();
}

module.exports = function() {
    this.init_usersettings = init_usersettings;
    this.create_or_reload_usersettings = create_or_reload_usersettings;
    this.reload_usersettings_tables_if_existing = reload_usersettings_tables_if_existing;
};
